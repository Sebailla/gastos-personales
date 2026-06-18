# Propuesta — `accounts-ledger`

**Estado**: draft · **Autor**: Sebastián Illa
**Creado**: 2026-06-18 · **Slice objetivo**: MVP-2 (entidades financieras) · **Capacidad**: accounts
**Origen**: preflight global de SDD (interactive, both, auto-forecast, 400 lines)
**Reemplaza**: propuesta v1 (PR #26, cerrado sin mergear el 2026-06-18) — los requisitos se expandieron después de la revisión del usuario. El historial git de v1 queda solo como referencia; su contenido es **obsoleto**.

> **Nota v2**: esta es la segunda escritura de esta propuesta. La v1 modelaba la capacidad como **plana** — una fila por cuenta, una sola moneda por cuenta, sin sub-entidades. La v2 introduce **estructura por tipo** (múltiples sub-cuentas por banco, múltiples tarjetas por emisor, múltiples cuentas de inversión por broker; las tres entidades son texto libre por ahora), una **whitelist de monedas + conversión FX solo para display**, y un **nuevo endpoint `/balance`** con soporte de `?displayCurrency`.

## Ronda de preguntas de la propuesta (nota de proceso)

Antes de escribir esta propuesta intenté una ronda de preguntas de producto. El entrevistador estructurado (`contact_supervisor` con `interview_request`) rechazó los payloads de opciones en cada reintento; el canal `need_decision` del supervisor agotó el timeout de 10 minutos en un intento paralelo. Procedí con defaults explícitos en la sección **Decisiones abiertas**; el revisor puede override cualquiera de ellos antes de aprobar.

Las tres preguntas de producto que habría hecho:

1. **Vencimiento de la tasa FX** — cuando `fx-cache` devuelve una tasa más vieja que el último día hábil (fin de semana, feriado, caída del rate provider >24h), ¿qué debe devolver `GET /api/accounts/:id/balance?displayCurrency=…`?
2. **Normalización de texto libre** — para los campos free-text `bankName` (BANK), `issuer` (CREDIT), `broker` (INVESTMENT), ¿los almacenamos verbatim o normalizamos?
3. **Default del bloque `display`** — ¿el bloque `display` está siempre presente en el DTO, o solo cuando el caller pasa `?displayCurrency` explícito?

Los defaults elegidos y la rationale están en **Decisiones abiertas** (Q1/Q2/Q3 debajo).

## Por qué

La capacidad `accounts` es la segunda capacidad del roadmap SDD y la primera que posee datos financieros propios del usuario. `auth-foundation` (Slices A + B + C, todos mergeados a `develop`) hizo que `userId` sea confiable en cada request. El siguiente paso es dejar que cada usuario registre lo que tiene — efectivo en mano, cuentas bancarias, tarjetas de crédito, inversiones, wallets cripto, cualquier otra cosa — para que las capacidades posteriores (`transactions`, `networth-snapshot`, `reports-mvp`) tengan algo a qué atarse.

La v1 de esta propuesta salió con un **modelo plano** — una fila por cuenta, una sola moneda por cuenta, sin estructura de sub-entidades — y el usuario expandió los requisitos después de revisar. El gap de producto que la v2 cierra:

- Un usuario tiene **múltiples cuentas bancarias en el mismo banco** ("caja de ahorro en Galicia" y "cuenta corriente en Galicia" deben ser dos filas de `FinancialAccount` bajo `bankName = "Banco Galicia"`).
- Un usuario tiene **múltiples tarjetas de distintos emisores** ("Visa Galicia", "Mastercard Santander", "Amex" no son la misma fila).
- Un usuario tiene **múltiples cuentas de inversión en múltiples brokers**, con distintos **tipos de inversión** (stocks, bonds, mutual funds, certificados de depósito, otros).
- El usuario quiere **leer una cuenta en otra moneda** ("¿cuánto vale en USD mi caja de ahorro en ARS ahora?") **sin almacenar el valor convertido**.
- El soporte de moneda en la v1 era implícito y sin restricción; la v2 lo restringe a `{ ARS, USD, EUR }` y apunta a una fuente de tasas FX diferida, propiedad de `fx-cache`.

El PR #26 (v1) se cerró sin mergear el 2026-06-18 porque los requisitos de arriba aparecieron después de que el PR de v1 se abrió. Esta v2 reemplaza a la v1; el historial git de v1 queda solo como referencia y su contenido es obsoleto.

## Qué entrega

Un módulo `accounts` autocontenido bajo `src/modules/accounts/{domain,application,infrastructure}/...`, respaldado por un nuevo modelo `FinancialAccount` de Prisma, expuesto a través de 7 endpoints de Hono bajo `/api/accounts`, con un contrato de fuente de tasas FX diferido que `fx-cache` va a cumplir.

| Concern                                                              | Responsabilidad                                                                                           |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Tipos de dominio y reglas de negocio                                 | **Módulo `accounts` — `src/modules/accounts/domain/`**                                                    |
| Casos de uso (create, list, update, archive, unarchive, get-balance) | **Módulo `accounts` — `src/modules/accounts/application/`**                                               |
| Superficie HTTP                                                      | **Hono** montado en el catch-all existente `app/api/[...path]/route.ts`                                   |
| Persistencia                                                         | **Prisma 6** — nuevo modelo `FinancialAccount` + 3 enums (`AccountType`, `AccountKind`, `InvestmentType`) |
| Validación                                                           | **Zod** uniones discriminadas en cada frontera de acción, incluyendo los campos requeridos por tipo       |
| Fuente de tasa FX                                                    | **Diferida** a `fx-cache` — este cambio solo define el contrato (interfaz `FxRateProvider`)               |
| Caché o almacenamiento de tasas FX                                   | **No en este cambio** — `fx-cache` es dueño del almacenamiento y del rate provider                        |
| Framework de tests                                                   | **Vitest** bajo `pnpm test`; TDD estricto en la capa de dominio                                           |

### Endpoints

| Método | Ruta                          | Auth    | Comportamiento                                                                                                                                                                                                                                                                                                           |
| ------ | ----------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/accounts`               | session | Paginación por cursor, filtros: `?includeArchived`, `?type`, `?bankName` (solo BANK), `?issuer` (solo CREDIT). Devuelve solo el balance nativo — sin bloque `display` (las listas son a lo sumo ~20 items; mezclar monedas en línea es un enhancement futuro, ver Decisiones abiertas D6).                               |
| POST   | `/api/accounts`               | session | Create con unión discriminada de Zod específica por tipo (los campos requeridos por tipo se enforced en la validación). 201 en éxito, 400 en validación, 409 en nombre duplicado dentro del namespace del usuario, con origin-check.                                                                                     |
| GET    | `/api/accounts/:id`           | session | Devuelve la cuenta completa con los campos específicos del tipo populados y un bloque `display` (`{ amount, currency, fxRate, fxAsOf }`) reflejando el `?displayCurrency` solicitado (default = native).                                                                                                                 |
| GET    | `/api/accounts/:id/balance`   | session | **NUEVO en v2**: devuelve el balance nativo + un bloque `display` con conversión opcional vía `?displayCurrency` (default = native). 503 `FX_UNAVAILABLE` si el provider está caído; 409 `FX_NOT_SUPPORTED` si el par no está en el set soportado.                                                                       |
| PATCH  | `/api/accounts/:id`           | session | Update de campos mutables. **Forbidden**: `type`, `userId`, `openingBalanceMode` (inmutables post-creación). Mutables: `name`, los campos requeridos por tipo del tipo existente, `archivedAt` (vía los endpoints dedicados), `creditLimit` / `statementDay` / `paymentDueDay` para CREDIT, `walletAddress` para CRYPTO. |
| POST   | `/api/accounts/:id/archive`   | session | Soft archive idempotente (setea `archivedAt = now()` si no estaba seteado).                                                                                                                                                                                                                                              |
| POST   | `/api/accounts/:id/unarchive` | session | Unarchive idempotente (limpia `archivedAt`).                                                                                                                                                                                                                                                                             |

### Modelo de datos

El nuevo modelo de Prisma y los tres enums. Los modelos de Auth.js (`User`, `Account`, `Session`, `VerificationToken`) **no** se modifican (BR-ACC-9).

```prisma
// prisma/schema.prisma (aditivo)

model FinancialAccount {
  id                   String        @id @default(cuid())
  userId               String

  // identity
  name                 String        // user-chosen display name; unique per user (BR-ACC-5)
  type                 AccountType

  // currency (one of ARS, USD, EUR — BR-ACC-2)
  currency             String        @db.Char(3)

  // opening balance hybrid (BR-ACC-3) — openingBalanceMode lives in the DTO;
  // the amount/date columns below are what gets persisted
  openingBalanceAmount Decimal       @default(0)  @db.Decimal(19, 4)
  openingBalanceDate   DateTime      @db.Date

  // CREDIT-only fields (required when type = CREDIT; forbidden otherwise — Zod)
  issuer               String?
  creditLimit          Decimal?      @db.Decimal(19, 4)
  statementDay         Int?          // 1..28
  paymentDueDay        Int?          // 1..28

  // BANK-only fields (required when type = BANK)
  bankName             String?
  accountKind          AccountKind?

  // INVESTMENT-only fields (required when type = INVESTMENT)
  broker               String?
  investmentType       InvestmentType?

  // CRYPTO-only field (optional)
  walletAddress        String?

  // lifecycle
  archivedAt           DateTime?

  createdAt            DateTime      @default(now())
  updatedAt            DateTime      @updatedAt

  user                 User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, createdAt(sort: Desc)])
  @@index([userId, archivedAt])
  @@index([userId, type])
  @@unique([userId, name])
}

enum AccountType {
  CASH
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  OTHER
}

enum AccountKind {
  SAVINGS
  CHECKING
}

enum InvestmentType {
  STOCKS
  BONDS
  MUTUAL_FUNDS
  CERTS_OF_DEPOSIT
  OTHER
}
```

**Colisión de naming (heredada de v1)**: `FinancialAccount` en la capa de Prisma, `Account` en la capa pública de API/DTO. Auth.js es dueño del modelo `Account` de OAuth-link; no lo tocamos. La capa de DTO hace el mapeo en cada frontera.

### Comportamiento

#### Campos requeridos por tipo (BR-ACC-8)

El endpoint de create usa una **unión discriminada** de Zod sobre `type`. Campos requeridos por tipo:

| `type`       | Campos requeridos                                                    | Campos opcionales                                                     |
| ------------ | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `CASH`       | `currency`                                                           | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `BANK`       | `bankName`, `accountKind`, `currency`                                | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `CREDIT`     | `issuer`, `creditLimit`, `statementDay`, `paymentDueDay`, `currency` | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `INVESTMENT` | `broker`, `investmentType`, `currency`                               | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |
| `CRYPTO`     | `currency`                                                           | `walletAddress`, `name`, `openingBalanceAmount`, `openingBalanceDate` |
| `OTHER`      | `currency`                                                           | `name`, `openingBalanceAmount`, `openingBalanceDate`                  |

`statementDay` y `paymentDueDay` se validan en `[1, 28]` (seguridad de febrero — ver Decisiones abiertas D4). `currency` se valida contra `{ ARS, USD, EUR }` (BR-ACC-2). La forma de `openingBalanceAmount` y `openingBalanceDate` depende de `openingBalanceMode`:

- `'historical'`: `openingBalanceAmount` es **requerido** (string en el DTO, coercionado a `Decimal`); `openingBalanceDate` es **requerido** y debe ser ≤ hoy.
- `'fresh'`: `openingBalanceAmount` default a `0`; `openingBalanceDate` default a `createdAt`.

#### Semántica de update

- **Inmutables**: `type`, `userId`, `openingBalanceMode`. Intentar PATCH sobre cualquiera devuelve 400 `IMMUTABLE_FIELD`.
- **Mutables**: `name`, `currency` (con re-validación según BR-ACC-2), los campos requeridos por tipo del tipo **existente**, más `archivedAt` vía los endpoints dedicados.
- **PATCH nunca archiva ni desarchiva** — esas operaciones van por los endpoints dedicados idempotentes para mantener los audit trails limpios.

#### Ciclo de vida del soft archive (BR-ACC-4)

- `archivedAt = null` → active.
- `archivedAt != null` → archived.
- `POST /api/accounts/:id/archive` setea `archivedAt = now()` si no estaba seteado; no-op en caso contrario (idempotente).
- `POST /api/accounts/:id/unarchive` limpia `archivedAt`; no-op en caso contrario (idempotente).
- El endpoint de list **excluye** las filas archivadas por default; `?includeArchived=true` devuelve ambas.
- Todos los otros endpoints (GET, PATCH, balance) **aceptan** filas archivadas para que el usuario pueda ver el resumen histórico de una tarjeta cerrada. PATCH no permite archivar por este camino.

#### Contrato de display FX (BR-ACC-12)

El nuevo endpoint `GET /api/accounts/:id/balance?displayCurrency=USD` devuelve:

```json
{
  "data": {
    "accountId": "<cuid>",
    "nativeBalance": "1000.00",
    "nativeCurrency": "ARS",
    "asOf": "2026-06-18T00:00:00.000Z",
    "display": {
      "amount": "1.10",
      "currency": "USD",
      "fxRate": "0.00110",
      "fxAsOf": "2026-06-17T20:00:00.000Z"
    }
  }
}
```

Matriz de comportamiento:

| `?displayCurrency`                      | Bloque `display`                                         | Errores                                        |
| --------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| omitido / `=` native                    | refleja `nativeBalance`; `fxRate = "1"`, `fxAsOf = null` | ninguno                                        |
| `=` USD cuando native es ARS / EUR      | convertido                                               | 503 si fx-cache caído; 409 si par no soportado |
| `=` EUR cuando native es ARS / USD      | convertido                                               | 503 si fx-cache caído; 409 si par no soportado |
| `=` ARS, USD, EUR pero par no soportado | —                                                        | 409 `FX_NOT_SUPPORTED`                         |
| provider fx-cache no disponible         | —                                                        | 503 `FX_UNAVAILABLE`                           |

El balance nativo **nunca se muta** por este flujo. La conversión es solo para display.

La interfaz `FxRateProvider` (vive en `src/modules/accounts/infrastructure/fx-rate-provider.ts` en este cambio; la **implementación** la provee `fx-cache` en un cambio futuro):

```ts
export interface FxRateProvider {
  /** Returns the FX rate from `from` → `to` at the provider's most recent rate timestamp. */
  getRate(from: Currency, to: Currency): Promise<FxRate>;
}

export interface FxRate {
  rate: Decimal; // e.g., 0.00110 for 1 ARS = 0.00110 USD
  asOf: Date; // timestamp the rate was published by the upstream provider
}

export type Currency = 'ARS' | 'USD' | 'EUR';
```

En este cambio, el módulo es dueño de la **interfaz** y de un **stub provider** para los tests; el provider real se wirea en `fx-cache`. El wireado es un cambio de 1 línea en el composition root, capturado en `sdd-design`.

#### Integración entre módulos

Este cambio se integra con dos módulos.

| Módulo     | Contrato                                                                                                      | Dirección                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `auth`     | Helper server-side `auth()` (desde `src/modules/auth/index.ts`) que devuelve `session.user.id` para `userId`. | depende de `auth`                                       |
| `fx-cache` | `FxRateProvider.getRate(from, to)` devuelve `{ rate, asOf }`. Stub en este cambio; real en `fx-cache`.        | define la interfaz; `fx-cache` provee la implementación |

La dependencia de `fx-cache` es **load-bearing**: si `fx-cache` no está deployado, el endpoint de balance devuelve 503 `FX_UNAVAILABLE` para cualquier conversión no trivial. Esto está documentado en **Riesgos** y en la **restricción de orden de `fx-cache`** debajo.

## Fuera de alcance (este cambio)

- Una entidad catálogo `Bank` (los bancos son valores free-text de `bankName` por ahora; el catálogo se difiere).
- Una entidad catálogo `Broker` (ídem — `broker` free-text).
- Una entidad catálogo `Issuer` (ídem — `issuer` free-text).
- Multi-moneda más allá de `{ ARS, USD, EUR }`.
- Transactions, snapshots, reports, PWA shell.
- El cambio `fx-cache` en sí — esta propuesta define el contrato; la implementación vive en `fx-cache`.
- Tasas FX en tiempo real desde una API externa — `fx-cache` es dueño de esto; si `fx-cache` provee una tasa, la usamos; si no, 503.
- `DELETE /api/accounts/:id` (hard delete reservado para el futuro cambio `user-deletion`).
- El endpoint summary `/api/banks` que liste los valores distintos de `bankName` por usuario — flagged como enhancement futuro en BR-ACC-11.

## No-objetivos

- Un dashboard de balances (UI es `pwa-shell`).
- Netting multi-moneda (un futuro cambio `networth-snapshot` lee las cuentas en su moneda nativa y usa `fx-cache` a nivel de snapshot).
- Compartir cuentas entre usuarios (ownership single-user en MVP).
- Transferencias entre filas de `Account` (no hay primitiva de transferencia interna; los movimientos van por `transactions`).
- Reconstrucción de balance histórico desde transactions (el `openingBalance` es la semilla; las transactions son append-only hacia adelante).

## Usuarios y situaciones

| Usuario                                               | Situación                                                                                                       | Touchpoint                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Un usuario haciendo onboarding post-`auth-foundation` | Registra el primer set de cuentas que tiene (efectivo, una cuenta corriente, una tarjeta de crédito).           | `POST /api/accounts` (unión por tipo)                               |
| Un usuario con múltiples cuentas bancarias            | Agrega "Caja de ahorro Galicia" y "Cuenta corriente Galicia" como dos filas bajo `bankName = "Banco Galicia"`.  | `POST /api/accounts` con `type = BANK`                              |
| Un usuario con múltiples tarjetas                     | Agrega "Visa Galicia", "Mastercard Santander", "Amex" como tres filas CREDIT con distintos valores de `issuer`. | `POST /api/accounts` con `type = CREDIT`                            |
| Un usuario con caja de ahorro en ARS                  | Lee el balance en USD para ver el valor de hoy sin almacenar la conversión.                                     | `GET /api/accounts/:id/balance?displayCurrency=USD`                 |
| Un usuario cerrando una tarjeta                       | Soft-archiva la tarjeta de crédito (sin hard delete).                                                           | `POST /api/accounts/:id/archive`                                    |
| Un usuario volviendo a una tarjeta cerrada            | Lee el balance histórico de la tarjeta archivada.                                                               | `GET /api/accounts/:id/balance` (las filas archivadas son legibles) |

## Reglas de negocio

IDs estables `BR-ACC-NN` — referenciados desde `sdd-spec`, `sdd-design` y `sdd-tasks`.

- **BR-ACC-1** (enum): `type ∈ { CASH, BANK, CREDIT, INVESTMENT, CRYPTO, OTHER }`. El enum es cerrado; agregar un tipo nuevo es una migración de schema + un delta de spec + un ADR. Los field sets por tipo están documentados en **Comportamiento → Campos requeridos por tipo**.
- **BR-ACC-2** (whitelist de moneda): `currency ∈ { ARS, USD, EUR }`. ISO-4217 en mayúsculas. Zod refine. Cualquier otro valor se rechaza con 400 `VALIDATION_ERROR`.
- **BR-ACC-3** (opening balance híbrido): el payload de create usa una unión discriminada de Zod sobre `openingBalanceMode: 'historical' | 'fresh'`. La variante `'historical'` requiere tanto `openingBalanceAmount` (se admite no-cero; positivo o negativo) como `openingBalanceDate` (≤ hoy). La variante `'fresh'` defaultea `openingBalanceAmount` a `0` y `openingBalanceDate` a `createdAt`. Las columnas persistidas son `openingBalanceAmount` y `openingBalanceDate`; el modo es un concepto de DTO, no una columna.
- **BR-ACC-4** (soft archive): `archivedAt` es el marcador de ciclo de vida. `POST /archive` lo setea idempotentemente; `POST /unarchive` lo limpia idempotentemente. El endpoint de list excluye las filas archivadas por default; `?includeArchived=true` devuelve ambas. **No hay endpoint DELETE en este cambio.**
- **BR-ACC-5** (nombre único por usuario): `@@unique([userId, name])`. Nombre duplicado dentro del namespace de un usuario devuelve 409 `DUPLICATE_NAME`. El usuario puede renombrar libremente vía PATCH; la constraint re-valida en el rename.
- **BR-ACC-6** (scope de ownership): cada query es `WHERE userId = ?` donde `?` es el `session.user.id` autenticado. La capa de Prisma nunca compone una query sin esta cláusula; la capa de aplicación la enforce.
- **BR-ACC-7** (404 no 403): acceso cross-user devuelve 404 `NOT_FOUND`, nunca 403, para evitar leakear la existencia de la cuenta.
- **BR-ACC-8** (campos requeridos por tipo): el DTO de create es una unión discriminada de Zod sobre `type`. BANK requiere `bankName` + `accountKind`; CREDIT requiere `issuer` + `creditLimit` + `statementDay` + `paymentDueDay`; INVESTMENT requiere `broker` + `investmentType`. Los campos requeridos por tipo también son **forbidden** cuando el tipo no coincide (ej., `bankName` en una fila CREDIT se rechaza). Las violaciones de forbidden-field devuelven 400 `VALIDATION_ERROR`.
- **BR-ACC-9** (sin modificaciones a tablas de auth): los modelos de Prisma de Auth.js (`User`, `Account`, `Session`, `VerificationToken`) no se modifican. La fila `Account` de Auth.js y la fila `FinancialAccount` financiera conviven en la misma base de datos; este cambio no introduce ninguna FK cross-table entre ellas.
- **BR-ACC-10** (middleware `origin-check` en endpoints mutadores): todo POST y PATCH bajo `/api/accounts/*` corre el mismo middleware de origin-check que `auth-foundation` usa en `/api/auth/register`. `Origin` faltante o mismatcheado devuelve 403 `FORBIDDEN`.
- **BR-ACC-11** (agregación de BANK es un tema de list, no de ruta): las cuentas BANK comparten el mismo valor de `bankName` entre múltiples filas de `FinancialAccount`. La v2 entrega `?bankName=X` solo como filtro de list. Un futuro endpoint summary `/api/banks` que devuelva los valores distintos de `bankName` por usuario queda fuera de alcance y vive en un cambio siguiente una vez que exista la entidad catálogo `Bank`.
- **BR-ACC-12** (contrato de display FX): `GET /api/accounts/:id/balance` acepta `?displayCurrency=ARS|USD|EUR` (default = native). Cuando `displayCurrency == nativeCurrency`, el bloque `display` refleja `nativeBalance` con `fxRate = "1"` y `fxAsOf = null`. Cuando `displayCurrency != nativeCurrency`, el bloque `display` requiere un `FxRateProvider` funcionando. Si el provider no está disponible, devuelve `503 FX_UNAVAILABLE`; si el par no es soportado por el provider, devuelve `409 FX_NOT_SUPPORTED`. **El storage nunca se toca.** `GET /api/accounts/:id` lleva el mismo bloque `display`.
- **BR-ACC-13** (frescura de la tasa FX — default pendiente): cuando el `FxRateProvider` devuelve una tasa más vieja que el cierre del último día hábil (ej., fin de semana, feriado, caída del rate provider >24h), el endpoint devuelve la tasa de todos modos con `fxAsOf` mostrando el timestamp. Rationale: las queries de fin de semana no deberían 5xxear; el usuario ve el timestamp y decide. **Override pendiente**: ver Decisiones abiertas Q1.

## Implicaciones e impacto

| Área                       | Impacto                                                                                                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema                     | Un modelo nuevo (`FinancialAccount`) + 3 enums + 3 indexes + 1 unique constraint. La migración es aditiva; las filas existentes no se afectan.            |
| Capacidad `auth`           | Sin cambios. Reusa el helper server-side `auth()` desde `src/modules/auth/index.ts`.                                                                      |
| Hono catch-all             | Agrega 7 rutas bajo `/api/accounts/*`. El catch-all ya existe desde `auth-foundation-slice-c`.                                                            |
| Middleware                 | El middleware `origin-check` ya existe desde `auth-foundation`; las rutas mutadoras nuevas se enchufan a él.                                              |
| Test runner                | Vitest ya configurado. La capa de dominio sigue TDD estricto (RED → GREEN → REFACTOR) según la config `strictTdd` del proyecto.                           |
| Capacidad `fx-cache`       | **Dependencia NUEVA**. Este cambio define la interfaz `FxRateProvider`; `fx-cache` provee la implementación real. Load-bearing en el endpoint de balance. |
| Futuro `networth-snapshot` | Iterará sobre las cuentas y usará `fx-cache` a nivel de snapshot — independiente de este cambio.                                                          |
| Futuro `transactions`      | Referenciará `FinancialAccount.id` como target de FK. El schema es forward-compatible.                                                                    |
| Futuro `user-deletion`     | Hard-delete de filas `FinancialAccount` vía el `onDelete: Cascade` existente sobre `User`. Sin trabajo en este cambio.                                    |
| Futuro catálogo `Bank`     | Backfill de `bankName` → `Bank.id` FK; la columna free-text actual pasa a ser el nombre desnormalizado para backward compat.                              |
| Futuro `User.baseCurrency` | Hará que `?displayCurrency` defaultee a la base currency del usuario cuando se omita. La v2 sale con comportamiento explícito de query param.             |
| CI                         | Ya está verde en el trabajo de `auth-foundation`; este cambio reusa el mismo pipeline.                                                                    |

## Casos borde (producto)

| Escenario                                                                               | Comportamiento                                                                                                                   |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| El usuario crea dos cuentas BANK en el mismo banco con el mismo `accountKind`.          | Permitido. `name` las diferencia; `(userId, name)` es la unique constraint, no `(userId, bankName, accountKind)`.                |
| El usuario PATCHea `type` de BANK a CREDIT.                                             | 400 `IMMUTABLE_FIELD`. El `type` es el discriminador del significado de toda la fila; cambiarlo invalida todos los demás campos. |
| El usuario PATCHea `name` a un valor ya usado por otra cuenta.                          | 409 `DUPLICATE_NAME`.                                                                                                            |
| El usuario crea una cuenta con `currency = "ars"` (lowercase).                          | 400 `VALIDATION_ERROR`. El Zod refine hace uppercase-y-checa.                                                                    |
| El usuario llama `balance?displayCurrency=GBP`.                                         | 400 `VALIDATION_ERROR`. GBP no está en `{ ARS, USD, EUR }`.                                                                      |
| El usuario llama `balance?displayCurrency=USD` cuando la native ya es USD.              | `display` refleja `nativeBalance` con `fxRate = "1"` y `fxAsOf = null`. No se llama al provider.                                 |
| El usuario llama `balance?displayCurrency=USD` cuando `fx-cache` está caído.            | 503 `FX_UNAVAILABLE`.                                                                                                            |
| El usuario llama `balance?displayCurrency=USD` cuando el par ARS→USD no está soportado. | 409 `FX_NOT_SUPPORTED`.                                                                                                          |
| El usuario llama `balance?displayCurrency=USD` un sábado con la tasa del viernes.       | (Default) 200 con `fxAsOf` mostrando el cierre del viernes. Override vía Decisiones abiertas Q1.                                 |
| El usuario archiva una cuenta ya archivada.                                             | 200, idempotente. No-op.                                                                                                         |
| El usuario lee una cuenta archivada.                                                    | 200, DTO completo devuelto. Las cuentas archivadas son legibles pero no se listean por default.                                  |
| El usuario lista con `?includeArchived=false` (default).                                | Filas archivadas excluidas.                                                                                                      |
| El usuario lista con `?type=CREDIT`.                                                    | Solo se devuelven filas CREDIT.                                                                                                  |
| El usuario lista con `?bankName=Galicia` (substring).                                   | No matchea — el filtro `bankName` es exact-match (post-trim). La búsqueda por substring es un follow-up.                         |
| Dos usuarios crean independientemente una cuenta llamada "Main".                        | Ambos успешно. La unicidad es per-user, no global.                                                                               |
| El usuario borra su cuenta (GDPR).                                                      | Out of scope. El cambio `user-deletion` maneja el cleanup de `FinancialAccount` vía el `onDelete: Cascade`.                      |

## Decisiones abiertas (para la próxima ronda de propuesta/spec)

Tres preguntas de producto y algunas decisiones diferidas. El revisor puede override cualquiera antes de aprobar.

| #   | Pregunta                                                                                                                                                                  | Default elegido                                                                                                                                                                                                                                              | Cómo resolver                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **Vencimiento de la tasa FX** — ¿qué debe devolver `GET /api/accounts/:id/balance?displayCurrency=…` cuando fx-cache devuelve una tasa más vieja que el último día hábil? | Devolver la tasa de todos modos; `display.fxAsOf` carga el timestamp. Rationale: las queries de fin de semana no deberían 5xxear; el usuario ve la frescura vía `fxAsOf`. Pasa a ser **BR-ACC-13**.                                                          | Aprobar / override en esta propuesta. El override es un párrafo en `Comportamiento → Contrato de display FX`.               |
| Q2  | **Normalización de texto libre** — para `bankName` (BANK), `issuer` (CREDIT), `broker` (INVESTMENT), ¿almacenamos verbatim o normalizamos?                                | Solo trim (whitespace al inicio/final); preservamos el casing del usuario. El filtro de list usa exact-match post-trim. Rationale: free-text significa elegido por el usuario; un futuro cambio de catálogo `Bank` / `Issuer` / `Broker` es dueño del dedup. | Aprobar / override en esta propuesta. Trivial de cambiar si un catálogo futuro quiere exact-match sobre un nombre canónico. |
| Q3  | **Default del bloque `display`** — ¿`display` está siempre presente en el DTO, o solo cuando se pide `displayCurrency`?                                                   | Siempre presente. Cuando `displayCurrency` se omite o coincide con native, el bloque refleja `nativeBalance` con `fxRate = "1"` y `fxAsOf = null`. Rationale: shape de DTO consistente; cliente más simple.                                                  | Aprobar / override. Alinear con la frase "default = native currency" del task.                                              |
| D1  | **Endpoint summary `/api/banks`** — fuera de alcance según BR-ACC-11.                                                                                                     | Diferido a un cambio siguiente una vez que exista la entidad catálogo `Bank`.                                                                                                                                                                                | Abrir como un nuevo cambio SDD (`accounts-banks-catalog`) cuando se diseñe el catálogo.                                     |
| D2  | **`User.baseCurrency`** — default implícito para `?displayCurrency`                                                                                                       | Diferido a `user-preferences`. La v2 sale con comportamiento explícito de query param únicamente.                                                                                                                                                            | Abrir como parte de `user-preferences`.                                                                                     |
| D3  | **Source of truth del balance** — ¿`openingBalanceAmount` es la única semilla, o agregamos `runningBalance` cuando llegue `transactions`?                                 | La v2 almacena solo `openingBalance`. El eventual `runningBalance` es una vista derivada (`openingBalance + SUM(transactions where type = CREDIT) - SUM(transactions where type = DEBIT)`) computada en `transactions` o `networth-snapshot`.                | Reevaluar cuando se scope `transactions`.                                                                                   |
| D4  | **Validación de statement-day / payment-due-day** — `1..28` vs `1..31`.                                                                                                   | `1..28` para ambos. Rationale: febrero tiene 28 días; 29/30/31 tendría que skipear 3 de cada 28 años.                                                                                                                                                        | Aprobar / override en `sdd-design`.                                                                                         |
| D5  | **Cobertura del middleware `origin-check`** — ¿la ruta `POST /api/accounts` opta por el middleware existente o define uno nuevo?                                          | Reusar el middleware `origin-check` existente de `auth-foundation` (BR-AUTH-12). Mismo middleware, sin nuevo code path.                                                                                                                                      | Sin acción — ya resuelto por auth foundation.                                                                               |
| D6  | **Display FX en el endpoint de list** — ¿el endpoint de list acepta `?displayCurrency`?                                                                                   | No. La v2 list devuelve solo native. El listado multi-moneda es un enhancement futuro una vez que exista `networth-snapshot`.                                                                                                                                | Abrir como parte del diseño de `networth-snapshot`.                                                                         |

## Criterios de aceptación (lo que verá el revisor)

1. `prisma/schema.prisma` contiene `FinancialAccount` + 3 enums + 3 indexes + 1 unique constraint; `pnpm prisma migrate dev --name accounts-ledger` sale bien.
2. `pnpm test` → verde en **todos** los archivos de tests unit e integration del módulo `accounts`. **Cero** archivos en `src/modules/accounts/**` excluidos de `vitest.config.ts`.
3. `pnpm run typecheck` → **0 errors**.
4. `pnpm test --coverage` → coverage sobre `src/modules/accounts/{domain,application}/**` **≥ 80%** (lines, branches, functions, statements).
5. La disciplina de TDD estricto es visible en el historial git: cada commit de test de dominio tiene un commit RED seguido de un commit GREEN (el worker muestra el ciclo en el handoff).
6. Los 7 endpoints están vivos bajo `/api/accounts/*` y devuelven los status codes documentados (200, 201, 400, 401, 403, 404, 409, 503).
7. El endpoint de create rechaza las violaciones específicas por tipo documentadas en BR-ACC-8 (cada combinación forbidden tiene al menos un test). `grep -c "VALIDATION_ERROR" src/modules/accounts/__tests__/create*.test.ts` devuelve el count esperado.
8. El shape del bloque `display` es idéntico entre `GET /api/accounts/:id` y `GET /api/accounts/:id/balance`. Un Zod schema compartido (`displayBlockSchema`) es la única fuente de verdad.
9. `GET /api/accounts/:id/balance?displayCurrency=USD` devuelve 503 `FX_UNAVAILABLE` cuando el stub de `FxRateProvider` tira un `ProviderUnavailable`, y 409 `FX_NOT_SUPPORTED` cuando tira `UnsupportedPair`. Cada branch tiene al menos un test.
10. El contrato de auth se respeta: cada acción llama a `auth()` y lee `session.user.id`. Ningún módulo lee cookies directamente. `grep -r "headers().get" src/modules/accounts` devuelve 0 matches.
11. El acceso cross-user devuelve 404 `NOT_FOUND`, nunca 403. Al menos un test lo assertea.
12. El middleware `origin-check` se aplica a todo endpoint mutador (`POST /api/accounts`, `PATCH /api/accounts/:id`, `POST /api/accounts/:id/archive`, `POST /api/accounts/:id/unarchive`). POSTs cross-origin devuelven 403 `FORBIDDEN`.
13. `openspec/changes/accounts-ledger/proposal.md` y `Documents-es/openspec/changes/accounts-ledger/proposal.md` están en sync. El drift detection corre en el mismo commit.
14. `openspec/specs/accounts/spec.md` se crea (o se appendea) durante `sdd-sync` con el contrato canónico de `FinancialAccount` y las 13 reglas de negocio BR-ACC-NN.
15. El PR abre contra `develop`. Después de la revisión y el squash-merge, la rama se borra y el worktree se remueve (según root AGENTS.md §7).

## Riesgos y dependencias

| Riesgo                                                                                                                                               | Mitigación                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`fx-cache` es load-bearing** pero aún no está implementado. El endpoint de balance no puede servir conversiones reales hasta que `fx-cache` salga. | La interfaz `FxRateProvider` se define en este cambio con un stub provider para los tests. El wireado en el composition root es un cambio de 1 línea cuando `fx-cache` llegue. **`fx-cache` DEBE salir antes de que accounts-ledger sea usable en producción.** |
| **TDD estricto en la capa de dominio** puede surfacear un design flaw no trivial tarde.                                                              | El primer PR (schema + types + Zod) es fundacional; el ciclo RED sobre los campos requeridos por tipo es el RED de mayor riesgo. Si la shape de la unión resulta mal, el costo del override está acotado a `src/modules/accounts/domain/`.                      |
| **Riesgo de colisión de naming**: alguien lee `Account` en código y lo confunde con el `Account` de Auth.js.                                         | La convención se enforce desde la capa de DTO (`financialAccount → accountDto`). Cada test de conversión de DTO assertea el discriminador de tipo. Un code comment en `src/modules/accounts/infrastructure/repository.ts` explica la elección.                  |
| **Proliferación de free-text `bankName` / `issuer` / `broker`** — mismo banco escrito de varias formas por el mismo usuario.                         | El endpoint de list devuelve todas las cuentas; el usuario ve los duplicados. Diferido al cambio de catálogo. Flagueado en D1.                                                                                                                                  |
| **Vencimiento de la tasa FX** podría confundir a los usuarios los fines de semana si se aprueba el default de Q1.                                    | El campo `fxAsOf` se renderiza en la UI con un timestamp visible; el cambio de UI es de `pwa-shell`. Esta propuesta lo documenta como expectation.                                                                                                              |
| **Regresiones de CI / lint** — las rutas de Hono agregan ~7 rutas tipadas nuevas; TS strict mode puede surfacear type errors.                        | El primer PR agrega los types y Zod schemas pasando `tsc --noEmit`; los PRs siguientes extienden incrementalmente. El workflow de CI de `auth-foundation-slice-c` catches regresiones temprano.                                                                 |
| **Provider `openrouter` de GGA no configurado** (heredado de `auth-foundation-slice-c`).                                                             | Según root AGENTS.md §2.6, la verificación on-disk es el gate; CI es el gate autoritativo. Documentado en cada handoff.                                                                                                                                         |

## Pronóstico de carga de revisión (mandatory)

3 PRs encadenados, cada uno por encima del budget de revisión de 400 líneas:

| PR                                            | Alcance                                                                                                                                                                                                                              | Líneas (est.) | Overage vs 400 |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | -------------- |
| **PR1 — Schema + types + Zod + repository**   | Modelo `FinancialAccount` + 3 enums + 3 indexes + unique constraint + las Zod schemas de unión discriminada + la interfaz del Prisma repository. ~6–8 tests unitarios sobre la unión discriminada.                                   | ~500          | 1.25×          |
| **PR2 — Domain + application + FX contract**  | Domain services (`createAccount`, `listAccounts`, `updateAccount`, `archiveAccount`, `unarchiveAccount`, `getBalance`); application services; la interfaz `FxRateProvider` + stub + error types; ~14–18 domain tests (TDD estricto). | ~700          | 1.75×          |
| **PR3 — Hono routes + integration + handoff** | 7 rutas Hono wireadas en el catch-all; integración del middleware `origin-check`; ~8–12 integration tests; handoff de `sdd-verify`. Actualizaciones del mirror en español para proposal.md, spec.md, design.md.                      | ~500          | 1.25×          |
| **Total**                                     |                                                                                                                                                                                                                                      | **~1,700**    | —              |

El usuario aceptó un overshoot de 3 PRs en la planificación de `auth-foundation-slice-c` (1,300 LOC a través de 3 PRs). El mismo patrón aplica acá. El overage de 1.75× de PR2 es el más grande por los 14+ tests de dominio; los tests de Zod de unión discriminada de PR1 tampoco son triviales. **El usuario puede splitear PR2 en PR2a (domain) + PR2b (application + FX contract) si lo prefiere.**

## Orden de cambios posteriores

Después de que este cambio se mergee, los siguientes quedan desbloqueados o parcialmente desbloqueados:

1. **`fx-cache`** — provee la implementación real de `FxRateProvider`. **Debe salir antes de que accounts-ledger sea usable en producción**, pero puede salir como co-PR o PR siguiente. La interfaz es el contrato.
2. `transactions` — referencia `FinancialAccount.id` como target de FK. El schema es forward-compatible (no hay columna `transactions` en `FinancialAccount`).
3. `networth-snapshot` — lee las cuentas y usa `fx-cache` a nivel de snapshot.
4. `reports-mvp` — depende de `accounts-ledger` + `networth-snapshot` + `fx-cache`.
5. `pwa-shell` — renderiza la lista de cuentas, el form de create (por tipo), el balance con display FX.
6. `accounts-banks-catalog` — backfill de `bankName` → `Bank.id` FK. Diferido hasta que se diseñe el catálogo.
7. `user-preferences` — introduce `User.baseCurrency`; hace que `?displayCurrency` sea opcional (defaultea a la base currency). Puramente aditivo.
8. `user-deletion` — hard-delete de filas `FinancialAccount` vía `onDelete: Cascade`. Sin cambio de schema.

## Próximo paso

Después de que el usuario apruebe esta propuesta, la próxima fase es `sdd-spec`:

- Producir `openspec/changes/accounts-ledger/spec.md` con entradas de delta-spec para la capacidad `accounts`, espejado a `Documents-es/openspec/changes/accounts-ledger/spec.md`. El canónico `openspec/specs/accounts/spec.md` se **crea** durante `sdd-sync` (todavía no existe).
- Luego `sdd-design`: pinear la interfaz `FxRateProvider`; pinear el path de reuse del middleware `origin-check`; pinear la shape de la unión Zod por tipo; pinear el Zod schema del bloque `display`.
- Luego `sdd-tasks`: romper PR1/PR2/PR3 en sub-tasks con columnas de evidencia de TDD.
- Luego `sdd-apply` (3 PRs encadenados como se pronosticó).
- Luego `sdd-verify` (re-correr verify sobre todo el cambio; esperar `PASS_WITH_FLAGS` si `fx-cache` no está deployado — el flag es "el endpoint de balance sirve 503 en producción hasta que `fx-cache` salga").
- Luego `sdd-sync`: promover el canónico `openspec/specs/accounts/spec.md`; archivar este cambio.
