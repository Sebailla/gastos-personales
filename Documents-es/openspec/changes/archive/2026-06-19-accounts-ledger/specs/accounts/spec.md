# Spec — capability `accounts`

**Author**: Sebastián Illa
**Capability**: `accounts` (nueva — primera escritura de este spec)
**Source change**: `accounts-ledger` (proposal v3, draft 2026-06-18)
**Status**: draft · **Created**: 2026-06-18
**Stack**: v3 — Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 (heredado de `auth-foundation`) + Prisma 6 + PostgreSQL (Neon) + Zod + Vitest + pnpm + Tailwind v4
**Preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · review budget de 400 líneas
**Strict TDD**: habilitado (según `openspec/config.yaml`); runner `pnpm test`; ciclo RED → GREEN → TRIANGULATE → REFACTOR

> Esta es la primera escritura del spec de la capability
> `accounts`. Operacionaliza la proposal v3 de `accounts-ledger`
> (draft 2026-06-18) más las 10 decisiones de producto cerradas
> en la misma sesión (ver "Decisiones cerradas" abajo). El spec
> declara **lo que debe ser cierto** después de que el cambio
> aterrice, no cómo implementarlo. Los detalles de
> implementación (rutas de archivo, sintaxis de schema, layout
> de tests) se limitan a lo que el contrato cross-module exige.

## Decisiones cerradas (2026-06-18, sesión padre)

Las 10 decisiones de producto son autoritativas donde
modifican o extienden la proposal. El spec las refleja como
Requirements y BRs, no como una sección separada de
"decisiones". Los números de decisión (1-10) se referencian
inline en los cuerpos de los Scenarios relevantes.

1. Idioma del smoke UI: solo inglés.
2. Redirect post-create: `router.push('/accounts')` + toast efímero `"Account created"` (~3 s).
3. FX stale: `display.fxAsOf` renderizado como texto plano `"Last updated: …"`; sin warning visual.
4. Query del listado: filtro `archivedAt: null`; sin columna ni toggle de estado archivado en el smoke slice.
5. Default de `openingBalanceMode`: `FRESH` marcado en el radio group del form.
6. Cambio de `type` en el form: reset silencioso de los campos type-specific; sin confirmación.
7. Validación de `openingBalanceMinor`: `>= 0` en cliente y servidor.
8. Select de `displayCurrency` en el widget: whitelist completa `{ ARS, USD, EUR }`; sin filtrar la currency nativa.
9. Footer de truncado del listado: renderizar `"Showing first 50 of <total>"` cuando la API devuelva `total > 50`.
10. 404 en detail: `redirect('/accounts')` + toast efímero `"Account not found or no access"`.

## Purpose (Propósito)

La capability `accounts` es el libro mayor de cuentas
financieras de `gastos-personales`. Es dueña de las cuentas
del usuario (las unidades source-of-truth: bank, credit,
investment, crypto, cash, other) y de una superficie
read-only de conversión FX display-only contra la que otras
capabilities (`transactions`, `fx-cache`, `snapshots`,
`reports`) se integrarán. La capability garantiza que: (a)
cada cuenta es propiedad de exactamente un `User`
autenticado (invariante cross-module heredado de la
capability `auth`, según `openspec/specs/auth/spec.md`); (b)
el modelo discriminated-union carga metadata per-type sin
explotar la tabla ni filtrar campos irrelevantes por tipo;
(c) todas las lecturas y escrituras están gateadas por el
helper server-side `auth()` desde `src/modules/auth/index.ts`;
(d) FX es un asunto de presentación, nunca una mutación de
storage — el balance nativo es el número autoritativo en la
fila, y la conversión display-only se calcula en tiempo de
lectura; (e) el smoke UI permite a un developer o PM ejercer
la API end-to-end en menos de cinco minutos sin curl,
brindando una referencia de typed-client y form-pattern para
el cambio futuro `ui-accounts`.

## Scope (Alcance)

### In scope

- Modelo Prisma `FinancialAccount` y cuatro enums (`AccountType`,
  `AccountKind`, `InvestmentType`, `OpeningBalanceMode`,
  `AccountCurrency`).
- Siete endpoints Hono bajo `/api/accounts` montados sobre el
  catch-all existente en `app/api/[...path]/route.ts`.
- Interface `FxRateProvider` declarada en `src/modules/accounts/`.
  Sin implementación; la implementación aterriza en `fx-cache`.
- Tres páginas Next.js App Router bajo `app/accounts/*` (smoke
  UI; hand-verified, sin tests automatizados).
- Wrapper del typed client de Hono en `src/lib/api-client.ts`.
- Setup de Tailwind v4 (`tailwindcss` + `@tailwindcss/postcss` o
  equivalente; finalizado en `sdd-design`).

### Out of scope

- Implementación de `fx-cache`; el `FxRateProvider` es solo un port.
- `transactions`, `snapshots`, `reports` — cada uno es su propio SDD
  change; consumirán la capability `accounts`.
- UI de producción (`ui-accounts` o `pwa-shell`).
- Email notifications, scheduled jobs, background workers.
- Bulk import / CSV upload.
- Hardening de auth de producción (rate limiting sobre endpoints UI-driven).

### El smoke UI NO es la UI de producción

- Sin auditoría de accesibilidad, sin i18n, sin SEO, sin SSR
  caching, sin error boundaries más allá de `error.tsx`.
- Sin navigation shell, sin theme system, sin design system,
  sin loading skeletons más allá de la string plana `"Loading…"`.
- Sin botones de edit / archive / unarchive en la UI. Los
  endpoints existen (la superficie API está completa); la UI
  no los llama en este change. Los botones se agregan en
  `ui-accounts`.
- Sin tests de UI. El smoke slice se verifica a mano: el
  developer o PM corre `pnpm dev`, inicia sesión, ejercita
  las tres páginas.
- Cada header de página lleva un comentario corto
  `// smoke-minimal, not production`.

## Entities (Entidades)

### `FinancialAccount`

La entidad source-of-truth única para las cuentas del
usuario. Una fila por cuenta. Una fila es propiedad de
exactamente un `User` (invariante cross-module: `userId` es
FK con `onDelete: Cascade` a `User.id` según
`openspec/specs/auth/spec.md`).

| Campo                 | Tipo                 | Restricciones                                               |
| --------------------- | -------------------- | ----------------------------------------------------------- |
| `id`                  | `string` (cuid)      | Primary key. Generado en el servidor. Inmutable.            |
| `userId`              | `string` (cuid)      | FK a `User.id` (capability `auth`). `onDelete: Cascade`.    |
| `type`                | `AccountType`        | Uno de los 6 valores del enum.                              |
| `name`                | `string`             | 1-80 chars. Único por `(userId, type)`.                     |
| `currency`            | `AccountCurrency`    | Uno de `{ ARS, USD, EUR }`.                                 |
| `openingBalanceMinor` | `Int`                | Unidades menores (centavos). `>= 0` (BR-ACC-16).            |
| `openingBalanceMode`  | `OpeningBalanceMode` | `FRESH` \| `HISTORICAL`.                                    |
| `openingBalanceDate`  | `DateTime?`          | Requerido si `mode = HISTORICAL`; `null` en caso contrario. |
| `archivedAt`          | `DateTime?`          | Marcador de soft-archive. `null` para cuentas vivas.        |
| `createdAt`           | `DateTime`           | Server-set en el insert.                                    |
| `updatedAt`           | `DateTime`           | Server-set en cada mutación.                                |

Campos type-specific (poblados solo para el `type` relevante,
forzados por el Zod create-schema por tipo):

| `type`       | Campos type-specific                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------ |
| `BANK`       | `bankName` (`string`), `accountKind` (`SAVINGS` \| `CHECKING`).                                  |
| `CREDIT`     | `issuer` (`string`), `creditLimitMinor` (`Int?`), `statementDay` (1-31), `paymentDueDay` (1-31). |
| `INVESTMENT` | `broker` (`string`), `investmentType` (enum).                                                    |
| `CRYPTO`     | `walletAddress` (`string?`).                                                                     |
| `CASH`       | (ninguno).                                                                                       |
| `OTHER`      | (ninguno).                                                                                       |

Índices:

- `@@unique([userId, type, name])` — los nombres son únicos por usuario y por tipo.
- `@@index([userId, archivedAt])` — vista de listado: cuentas vivas primero.
- `@@index([userId, createdAt])` — vista de listado: orden por recencia.

Invariantes:

- `openingBalanceDate` es no-null si y solo si `openingBalanceMode = HISTORICAL`.
- `openingBalanceMinor >= 0` (BR-ACC-16).
- El acceso cross-user devuelve `404`, no `403` (no se filtra la existencia).
- Un campo type-specific NO debe setearse para un `AccountType` distinto del que le pertenece (forzado por Zod).

### Enums

- `AccountType`: `BANK | CREDIT | INVESTMENT | CRYPTO | CASH | OTHER`.
- `AccountKind`: `SAVINGS | CHECKING`.
- `InvestmentType`: `STOCKS | BONDS | MUTUAL_FUNDS | CERTS_OF_DEPOSIT | OTHER`.
- `OpeningBalanceMode`: `FRESH | HISTORICAL`.
- `AccountCurrency`: `ARS | USD | EUR`.

## Business rules (Reglas de negocio)

### BR-ACC-12: Contrato de display FX (heredado de proposal v2)

`GET /api/accounts/:id/balance?displayCurrency=<ccy>` es un
endpoint read-only que convierte el balance nativo de la
cuenta a una currency de display para el caller. El balance
nativo en la fila nunca se muta. El contrato devuelve
`{ native: { amount, currency }, display?: { amount, currency,
fxRate, fxAsOf }, warnings?: string[] }`. Errores:
`503 FX_UNAVAILABLE` (provider no configurado), `409
FX_NOT_SUPPORTED` (par de currencies no soportado por el
provider configurado). El `FxRateProvider` es un port
declarado en `src/modules/accounts/`; no se entrega
implementación en este change.

### BR-ACC-13: Frescura del rate FX (heredado de proposal v2)

El provider devuelve el rate con `fxAsOf` incluso cuando el
rate está stale (fin de semana, > 24h de antigüedad, o más
viejo que la ventana de frescura del provider). Stale no es
un `5xx`. La UI muestra `fxAsOf` junto al monto convertido
para que un humano pueda juzgar la frescura. Ver BR-ACC-18
para la regla de renderizado del widget.

### BR-ACC-14: Regla de redirect UI (NEW en v3, de la proposal)

Un Server Component bajo `app/accounts/*` que resuelva una
sesión faltante DEBE redirigir a
`/auth/signin?callbackUrl=<original-path>`, donde el
`callbackUrl` está codificado con `encodeURIComponent`. La
regla aplica a las tres páginas (`/accounts`, `/accounts/new`,
`/accounts/[id]`). Las páginas nunca leen la cookie de sesión
directamente; llaman a `auth()` desde
`src/modules/auth/index.ts`.

### BR-ACC-15: Disciplina de estado del form (NEW en v3, de la proposal)

El form de create es un único Client Component. Su estado es
local (`useState` por campo). El form NO debe mantener al
usuario autenticado, la sesión, ni ningún dato derivado del
servidor en estado de cliente. Recibe la metadata de campos
type-specific vía props desde el Server Component shell. Esta
regla se extiende con BR-ACC-16 (default `openingBalanceMode`,
reset silencioso al cambiar `type`, `openingBalanceMinor >= 0`).

### BR-ACC-16: Comportamiento del form — estado y submit (NEW en v3, modificado de la "inline error surface" de la proposal)

El form de create DEBE:

- Marcar `openingBalanceMode = FRESH` como radio seleccionado
  por default en el primer render. (Decisión 5)
- Ante un cambio del campo `type`, resetear silenciosamente
  cada campo type-specific a su valor por default. Sin
  diálogo de confirmación. (Decisión 6)
- Validar `openingBalanceMinor >= 0` en el cliente (estado
  del form) y en el servidor (schema Zod). Un valor negativo
  DEBE ser rechazado en el form (submit deshabilitado o error
  inline) y en la API (`400 VALIDATION_ERROR` con el mensaje).
  (Decisión 7)
- Ante un `201 Created` de `POST /api/accounts`: invocar
  `router.push('/accounts')` y renderizar un toast efímero
  `"Account created"` por ~3 s vía un `<div role="status">`
  con estado local en el Server Component shell que envuelve
  al form. Sin librería de toasts. Sin contexto global.
  (Decisión 2)
- Ante un `4xx` (validación): re-renderizar con un banner de
  error inline bajo el submit mostrando el primer mensaje de
  error del campo `error` del body de respuesta. (BR-ACC-16
  de la proposal, preservado.)
- Ante un `5xx` o error de red: renderizar un banner genérico
  `"Something went wrong"` en el mismo slot.

### BR-ACC-17: Filtrado del listado (NEW en v3, de la sesión 2026-06-18)

La página de listado (`app/accounts/page.tsx`) DEBE llamar a
`GET /api/accounts` con `archivedAt=null` en la query. El
listado NO debe renderizar ninguna columna ni control de UI
para el estado archivado. La columna Prisma `archivedAt` y los
endpoints `/api/accounts/:id/archive` y `/:id/unarchive`
existen; el smoke UI no los expone. (Decisión 4)

### BR-ACC-18: Contrato del widget de balance (NEW en v3, de la sesión 2026-06-18)

El widget de balance en `/accounts/[id]` DEBE:

- Renderizar el balance nativo primero (siempre, incluso
  después de una conversión).
- Renderizar el `<select name="displayCurrency">` con la
  whitelist completa `{ ARS, USD, EUR }`. Sin filtrar la
  currency nativa. (Decisión 8)
- Ante un submit, llamar a
  `GET /api/accounts/:id/balance?displayCurrency=<selected>`.
- Renderizar `display.amount`, `display.fxRate`, y
  `display.fxAsOf` junto al balance nativo.
- Renderizar `display.fxAsOf` como texto plano en la forma
  `"Last updated: <ISO date>"`. Sin warning visual, sin
  bloquear rates stale. (Decisión 3)
- Ante `503 FX_UNAVAILABLE`: error inline
  `"FX rate provider unavailable. Try again in a few minutes."`
- Ante `409 FX_NOT_SUPPORTED`: error inline
  `"FX conversion not supported for this pair."`
- Usar `router.refresh()` después de una respuesta exitosa
  para que la página re-lea la cuenta (la fila no cambió,
  pero esto mantiene la cache del typed-client consistente
  para cualquier dato derivado del servidor a futuro).

### BR-ACC-19: Redirect 404 del detail (NEW en v3, de la sesión 2026-06-18)

Si `GET /api/accounts/:id` devuelve `404` (cross-user o
inexistente), el Server Component para `/accounts/[id]` DEBE
llamar a `redirect('/accounts')`. La página de listado luego
renderiza el toast efímero `"Account not found or no access"`
por ~3 s vía un `<div role="status">` con estado local. El
mecanismo de toast es el mismo que usa el flow de create
(BR-ACC-16, Decisión 2): sin librería, sin contexto global.
(Decisión 10)

## Requirements

### Data model

#### Requirement: FinancialAccount persiste el modelo discriminated de 6 tipos

El sistema DEBE persistir una fila `FinancialAccount` cuya
forma coincida con la tabla de la entidad, con los campos
type-specific poblados solo para el valor de `AccountType`
relevante. El sistema DEBE forzar los tres índices. El
sistema DEBE rechazar, en la capa de Zod schema, un body de
create que setee un campo type-specific para un `type` que
no le pertenece.

#### Scenario: Una fila BANK almacena bankName y accountKind

- GIVEN: un request body con `type = "BANK"`, `bankName = "ICBC"`, `accountKind = "SAVINGS"`
- WHEN: se llama a `POST /api/accounts`
- THEN: la fila se crea con `bankName = "ICBC"` y `accountKind = "SAVINGS"`
- AND: el response body incluye la fila completa

#### Scenario: Una fila CREDIT almacena issuer, creditLimit, statementDay, paymentDueDay

- GIVEN: un request body con `type = "CREDIT"`, `issuer = "Visa"`, `creditLimitMinor = 500000`, `statementDay = 5`, `paymentDueDay = 15`
- WHEN: se llama a `POST /api/accounts`
- THEN: la fila se crea con los cuatro campos type-specific poblados
- AND: `bankName` y `accountKind` son `null` en la fila

#### Scenario: Una fila INVESTMENT almacena broker e investmentType

- GIVEN: un request body con `type = "INVESTMENT"`, `broker = "Balanz"`, `investmentType = "STOCKS"`
- WHEN: se llama a `POST /api/accounts`
- THEN: la fila se crea con los dos campos type-specific poblados
- AND: `walletAddress` y `bankName` son `null`

#### Scenario: Una fila CRYPTO almacena walletAddress (opcional)

- GIVEN: un request body con `type = "CRYPTO"`, `walletAddress = "0x…"`
- WHEN: se llama a `POST /api/accounts`
- THEN: la fila se crea con `walletAddress` poblado
- AND: omitir `walletAddress` está permitido (es opcional en CRYPTO)

#### Scenario: Las filas CASH y OTHER no tienen campos type-specific

- GIVEN: un request body con `type = "CASH"` y sin campos type-specific
- WHEN: se llama a `POST /api/accounts`
- THEN: la fila se crea
- AND: el response body muestra todos los campos type-specific como `null`

#### Scenario: Un campo type-specific seteado para el type incorrecto es rechazado

- GIVEN: un request body con `type = "BANK"` y `walletAddress = "0x…"`
- WHEN: se llama a `POST /api/accounts`
- THEN: el response status es `400 VALIDATION_ERROR`
- AND: no se crea ninguna fila

#### Scenario: Colisión de nombre dentro de (userId, type) es rechazada

- GIVEN: un usuario ya tiene una cuenta BANK llamada `"Main"`
- WHEN: el usuario postea una segunda cuenta BANK con `name = "Main"`
- THEN: el response status es `409 NAME_TAKEN` (o código de error de dominio equivalente)
- AND: no se crea la segunda fila

### Endpoints

#### Requirement: GET /api/accounts devuelve un listado cursor-paginado scoped al usuario autenticado

El sistema DEBE devolver un listado paginado de las cuentas
vivas del usuario autenticado (aquellas con `archivedAt:
null`), ordenadas por `createdAt` descendente. El endpoint
DEBE soportar paginación por cursor vía
`?cursor=<opaque>&limit=<n>`. El `limit` por default es 20,
el máximo es 100.

#### Scenario: El listado devuelve las cuentas del usuario

- GIVEN: el usuario autenticado tiene 3 cuentas
- WHEN: se llama a `GET /api/accounts`
- THEN: el response status es `200`
- AND: el response body contiene un array `data` con 3 entries
- AND: el response body contiene `nextCursor` (null cuando hay menos de `limit`)

#### Scenario: El listado excluye las cuentas de otros usuarios

- GIVEN: otro usuario tiene 5 cuentas
- WHEN: el usuario autenticado llama a `GET /api/accounts`
- THEN: el response body contiene solo las cuentas del usuario autenticado
- AND: las cuentas cross-user no se enumeran

#### Scenario: El listado omite las cuentas archivadas

- GIVEN: el usuario tiene 4 cuentas, 1 de las cuales está archivada (`archivedAt != null`)
- WHEN: el usuario llama a `GET /api/accounts`
- THEN: el response body contiene 3 entries
- AND: la cuenta archivada no está en `data`

#### Scenario: Request no autenticada devuelve 401

- GIVEN: no hay cookie `authjs.session-token` presente
- WHEN: se llama a `GET /api/accounts`
- THEN: el response status es `401 UNAUTHORIZED`

#### Scenario: El limit se clampa al máximo

- GIVEN: cualquier estado
- WHEN: el caller pasa `?limit=500`
- THEN: el server clampa el limit a `100` para la query subyacente
- AND: el response sigue siendo `200`

#### Requirement: POST /api/accounts crea una cuenta type-driven

El sistema DEBE validar el body de create contra un Zod
schema seleccionado por `type` y persistir una fila
`FinancialAccount` propiedad del usuario autenticado. El
sistema DEBE devolver `201` con la fila completa creada en
caso de éxito, `400 VALIDATION_ERROR` ante falla de schema,
`409 NAME_TAKEN` ante colisión de `(userId, type, name)`, y
`401 UNAUTHORIZED` cuando no hay sesión presente.

#### Scenario: Un body BANK válido crea la cuenta y devuelve 201

- GIVEN: una sesión autenticada
- WHEN: se llama a `POST /api/accounts` con un body BANK válido
- THEN: el response status es `201`
- AND: el response body contiene la fila completa
- AND: el `userId` en la fila es el id del usuario de la sesión (el server NO debe confiar en un `userId` del body)

#### Scenario: Un openingBalanceMinor negativo es rechazado

- GIVEN: cualquier estado
- WHEN: el caller postea un body con `openingBalanceMinor = -100`
- THEN: el response status es `400 VALIDATION_ERROR`
- AND: el mensaje de error menciona la restricción non-negative (BR-ACC-16, Decisión 7)
- AND: no se crea ninguna fila

#### Scenario: HISTORICAL sin openingBalanceDate es rechazado

- GIVEN: cualquier estado
- WHEN: el caller postea `openingBalanceMode = "HISTORICAL"` y omite `openingBalanceDate`
- THEN: el response status es `400 VALIDATION_ERROR`
- AND: el mensaje de error nombra el campo faltante

#### Scenario: Nombre duplicado dentro de (userId, type) es rechazado

- GIVEN: el usuario tiene una cuenta llamada `"Main"` de tipo `BANK`
- WHEN: el usuario postea una segunda cuenta BANK con `name = "Main"`
- THEN: el response status es `409 NAME_TAKEN`
- AND: no se crea ninguna fila

#### Requirement: GET /api/accounts/:id devuelve una cuenta o 404 cross-user

#### Scenario: Una cuenta propia devuelve 200

- GIVEN: una cuenta propiedad del usuario autenticado
- WHEN: se llama a `GET /api/accounts/:id` con ese id
- THEN: el response status es `200`
- AND: el response body contiene la fila completa (incluyendo los campos type-specific)

#### Scenario: Una cuenta de otro usuario devuelve 404

- GIVEN: una cuenta propiedad de un usuario distinto
- WHEN: el usuario autenticado llama a `GET /api/accounts/:id` con ese id
- THEN: el response status es `404 NOT_FOUND`
- AND: el response body no filtra la existencia de la cuenta

#### Scenario: Un id inexistente devuelve 404

- GIVEN: ninguna fila con el id solicitado
- WHEN: se llama a `GET /api/accounts/:id`
- THEN: el response status es `404 NOT_FOUND`

#### Requirement: PATCH /api/accounts/:id aplica un partial update

El sistema DEBE aceptar un body parcial de campos actualizables
y devolver `200` con la fila actualizada. Los campos
type-specific son actualizables sujetos a la misma validación
per-type que en create. El sistema DEBE devolver `404
NOT_FOUND` para ids cross-user.

#### Scenario: Partial update del name

- GIVEN: una cuenta existente
- WHEN: el owner llama a `PATCH /api/accounts/:id` con `{ name: "Renamed" }`
- THEN: el response status es `200`
- AND: el `name` de la fila ahora es `"Renamed"`

#### Requirement: POST /api/accounts/:id/archive soft-archiva la cuenta

#### Scenario: Archivar una cuenta viva setea archivedAt

- GIVEN: una cuenta viva
- WHEN: el owner llama a `POST /api/accounts/:id/archive`
- THEN: el response status es `200`
- AND: el `archivedAt` de la fila es un timestamp no-null

#### Requirement: POST /api/accounts/:id/unarchive restaura la cuenta

#### Scenario: Unarchive limpia archivedAt

- GIVEN: una cuenta archivada
- WHEN: el owner llama a `POST /api/accounts/:id/unarchive`
- THEN: el response status es `200`
- AND: el `archivedAt` de la fila es `null`

#### Requirement: GET /api/accounts/:id/balance devuelve la conversión FX display-only

#### Scenario: Un par de currencies soportado devuelve la conversión

- GIVEN: la currency nativa de la cuenta es `USD`
- WHEN: el owner llama a `GET /api/accounts/:id/balance?displayCurrency=EUR`
- THEN: el response status es `200`
- AND: el campo `display` del response body contiene `amount`, `currency`, `fxRate`, `fxAsOf`
- AND: el campo `native` del response body contiene el balance nativo sin cambios

#### Scenario: Provider no configurado devuelve 503

- GIVEN: no hay ninguna implementación de `FxRateProvider` registrada (el change `fx-cache` no ha aterrizado)
- WHEN: el owner llama a `GET /api/accounts/:id/balance?displayCurrency=EUR`
- THEN: el response status es `503 FX_UNAVAILABLE`

#### Scenario: Par no soportado devuelve 409

- GIVEN: el provider configurado no soporta el par solicitado
- WHEN: el owner llama al endpoint
- THEN: el response status es `409 FX_NOT_SUPPORTED`

### UI smoke slice

#### Requirement: /accounts lista las cuentas vivas del usuario (Server Component)

`app/accounts/page.tsx` DEBE ser un Server Component que
resuelva la sesión vía `auth()` (BR-ACC-14), llame a
`GET /api/accounts` con `archivedAt=null` (BR-ACC-17), y
renderice un `<table>` con columnas `Name`, `Type`,
`Currency`, `Opening balance`. La página NO debe renderizar
ninguna columna de estado archivado. Ante un resultado
vacío, la página DEBE renderizar la string `"No accounts yet
— create one"` y un botón `New account` que linkee a
`/accounts/new`. Cuando la API reporte `total > 50`, la
página DEBE renderizar un footer con el texto exacto
`"Showing first 50 of <total>"`. Todo el copy es en inglés
(Decisión 1). El styling usa clases utility de Tailwind.

#### Scenario: Sesión faltante redirige a /auth/signin

- GIVEN: no hay cookie de sesión
- WHEN: el usuario visita `/accounts`
- THEN: el response es un 302 a `/auth/signin?callbackUrl=%2Faccounts`

#### Scenario: El listado vacío muestra el empty state

- GIVEN: un usuario autenticado con cero cuentas
- WHEN: el usuario visita `/accounts`
- THEN: la página renderiza `"No accounts yet — create one"`
- AND: la página renderiza un botón `New account` que linkea a `/accounts/new`

#### Scenario: El listado poblado muestra hasta 50 cuentas

- GIVEN: un usuario autenticado con 60 cuentas
- WHEN: el usuario visita `/accounts`
- THEN: la página renderiza una tabla con 50 filas
- AND: el footer dice exactamente `"Showing first 50 of 60"`

#### Requirement: /accounts/new renderiza el form de create type-driven (Server shell + Client form)

`app/accounts/new/page.tsx` DEBE ser un Server Component
shell que renderice un `<form>` e incruste un único Client
form component. El form DEBE renderizar un
`<select name="type">` con los 6 valores del enum, un
`<select name="currency">` con `{ ARS, USD, EUR }`, un
`<fieldset>` con los dos radios de `openingBalanceMode`
(FRESH seleccionado por default, BR-ACC-16 Decisión 5), y un
set discriminado de campos type-specific según la tabla de
la entidad. Ante un cambio de `type`, el form DEBE resetear
silenciosamente los campos type-specific a sus defaults
(BR-ACC-16 Decisión 6). `openingBalanceMinor` DEBE ser
`>= 0` en cliente y servidor (BR-ACC-16 Decisión 7). Ante
un `201`, el form DEBE `router.push('/accounts')` y
renderizar el toast efímero `"Account created"` (BR-ACC-16
Decisión 2). Ante un `4xx`, el banner de error inline muestra
el primer mensaje del campo `error` del body de respuesta.
Ante un `5xx` o error de red, el banner muestra `"Something
went wrong"`.

#### Scenario: Flujo de create fresh

- GIVEN: un usuario autenticado en `/accounts/new`
- WHEN: el usuario elige `type = BANK`, completa `name`, `bankName`, `accountKind`, `currency = USD`, deja `FRESH` seleccionado, y envía
- THEN: la API devuelve `201`
- AND: el usuario es redirigido a `/accounts`
- AND: el toast `"Account created"` es visible por ~3 s

#### Scenario: El cambio de type resetea los campos type-specific

- GIVEN: el usuario seleccionó `type = BANK` y tipeó `bankName = "ICBC"`
- WHEN: el usuario cambia el select de `type` a `CRYPTO`
- THEN: `bankName` se resetea a vacío
- AND: `accountKind` se resetea a su default
- AND: el campo `walletAddress` pasa a estar disponible (CRYPTO-specific)

#### Scenario: 4xx renderiza el banner de error inline

- GIVEN: una response `400 VALIDATION_ERROR` de la API
- WHEN: el form se re-renderiza
- THEN: el banner de error inline muestra el primer mensaje de error del campo `error` del body de respuesta

#### Requirement: /accounts/[id] muestra el detalle de la cuenta y el widget de balance (Server + Client widget)

`app/accounts/[id]/page.tsx` DEBE ser un Server Component que
resuelva la sesión, llame a `GET /api/accounts/:id`, y
renderice la fila completa en un `<dl>`. El widget de
balance es un Client Component que renderiza el balance
nativo, un `<select name="displayCurrency">` con la
whitelist completa `{ ARS, USD, EUR }` (BR-ACC-18 Decisión
8), un botón de submit, y una región para el resultado de la
conversión o el error inline. Ante un submit, el widget
DEBE llamar a `GET /api/accounts/:id/balance?displayCurrency=
<selected>`. Ante un `200`, el widget DEBE renderizar
`display.amount`, `display.fxRate`, y `display.fxAsOf` como
`"Last updated: …"` texto plano (BR-ACC-18 Decisión 3). El
widget DEBE llamar a `router.refresh()` después de una
response exitosa.

#### Scenario: El detail renderiza la fila

- GIVEN: una cuenta propiedad del usuario autenticado
- WHEN: el usuario visita `/accounts/:id`
- THEN: la página renderiza el name, type, currency, opening balance, y los campos type-specific de la cuenta en un `<dl>`

#### Scenario: 404 en detail redirige a /accounts con el toast "not found"

- GIVEN: cualquier estado
- WHEN: `GET /api/accounts/:id` devuelve `404`
- THEN: el Server Component llama a `redirect('/accounts')`
- AND: la página de listado renderiza el toast efímero `"Account not found or no access"` por ~3 s (BR-ACC-19, Decisión 10)

#### Scenario: El widget de balance renderiza la conversión

- GIVEN: la currency nativa de la cuenta es `USD`
- WHEN: el usuario elige `EUR` y envía el widget
- THEN: el widget renderiza el `display.amount` y `display.fxRate` convertidos junto al balance nativo
- AND: `display.fxAsOf` se renderiza como `"Last updated: <ISO date>"`

#### Scenario: El widget de surface 503 con el error inline

- GIVEN: el `FxRateProvider` no está registrado
- WHEN: el usuario envía el widget con cualquier `displayCurrency`
- THEN: el widget renderiza el error inline `"FX rate provider unavailable. Try again in a few minutes."`

### Validación, errores, integración con auth

#### Requirement: Todos los request bodies se validan con Zod schemas

El sistema DEBE validar cada body de `POST` y `PATCH` a
través de un Zod schema seleccionado por la operación (create
vs. update) y, para create, por `type`. Las fallas de
validación DEBEN devolver `400 VALIDATION_ERROR` con un body
de forma `{ error: { code: "VALIDATION_ERROR", message:
string, details?: Array<{ path: string; message: string }> } }`.
El primer item de `details` es lo que el banner de la UI
muestra.

#### Scenario: Una falla de schema devuelve 400 con body estructurado

- GIVEN: un body de create mal formado
- WHEN: se llama a la API
- THEN: el response status es `400`
- AND: el response body tiene la forma de `VALIDATION_ERROR`
- AND: `details[0]` describe el primer campo que falla

#### Requirement: Todos los endpoints requieren una sesión autenticada

Cada endpoint bajo `/api/accounts/*` DEBE requerir una
sesión autenticada resuelta vía `auth()` desde
`src/modules/auth/index.ts`. El sistema DEBE devolver `401
UNAUTHORIZED` cuando no hay sesión presente. El sistema NO
debe confiar en ningún campo `userId` de los request bodies;
la sesión es la fuente de verdad para la ownership.

#### Scenario: 401 en cada endpoint cuando no hay sesión

- GIVEN: no hay cookie `authjs.session-token`
- WHEN: se llama a cualquiera de los 7 endpoints
- THEN: el response status es `401 UNAUTHORIZED`
- AND: no se devuelve data

#### Requirement: Los errores siguen el envelope de error estándar del proyecto

El sistema DEBE devolver errores en el envelope
`{ error: { code: string, message: string, details?: unknown } }`
con un `code` estable por modo de falla. Los códigos de
dominio usados en este change incluyen `UNAUTHORIZED`,
`VALIDATION_ERROR`, `NOT_FOUND`, `NAME_TAKEN`,
`FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`. El sistema NO debe
incluir stack traces, objetos de error de Prisma, ni bodies
de request en la response de error.

#### Scenario: Las responses de error nunca filtran internos

- GIVEN: una excepción server-side (ej. timeout de Prisma)
- WHEN: se llama a cualquier endpoint
- THEN: el response status es `500`
- AND: el response body es `{ error: { code: "INTERNAL", message: "Something went wrong" } }`
- AND: no hay stack trace, mensaje de Prisma, ni body de request en la response

## References (Referencias)

- `openspec/changes/accounts-ledger/proposal.md` — proposal v3 (draft 2026-06-18); el spec operacionaliza la proposal.
- `openspec/specs/auth/spec.md` — capability canónica `auth`; invariante cross-module sobre `userId` y el helper server-side `auth()`.
- `openspec/config.yaml` — reglas de strict TDD; runner `pnpm test`.
- `openspec/changes/archive/auth-foundation-slice-c/spec.md` — spec delta hermano; referencia de formato y tono.
- `AGENTS.md` (root) — §5.3 política de `pnpm-lock.yaml`; §3 política de mirror de docs en dos idiomas.
