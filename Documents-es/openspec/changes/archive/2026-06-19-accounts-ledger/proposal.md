# Propuesta — `accounts-ledger`

**Status**: draft · **Autor**: Sebastián Illa · **Created**: 2026-06-18
**Supersedes**: v1 (PR #26), v2 (PR #27) — ambos cerrados sin mergear
**Target slice**: MVP-1 (libro mayor de cuentas + UI smoke)
**Upstream**: preflight global de SDD (interactive, both, auto-forecast, 400 lines)

> **v3 note**: tercera escritura de esta propuesta. v1 (PR #26,
> 2026-06-18) envió un modelo plano con whitelist `{ ARS, USD }` y
> se cerró sin mergear después de que el usuario expandiera los
> requisitos a mitad de revisión. v2 (PR #27, 2026-06-18) agregó
> estructura por tipo, expandió la whitelist a `{ ARS, USD, EUR }`,
> introdujo FX solo para display mediante un nuevo endpoint
> `/balance`, y también se cerró sin mergear (la revisión de UX
> descubrió la necesidad de una UI validable a mano antes de
> seguir con la API). **v3 mantiene intacta cada decisión de v2**
> y agrega un slice de **UI smoke-minimal** para que un developer o
> PM pueda ejercitar la API a mano en menos de cinco minutos. Sin
> cambios en Prisma ni en business rules respecto de v2.

## Why

`accounts-ledger` es la segunda capability que aterriza después de
`auth-foundation`. El modelo de Prisma, la estructura de 6 tipos
discriminados, la whitelist de monedas y el contrato de FX para
display ya están definidos en v2. Lo que v2 no tenía era una
forma de que un humano ejercite la API end-to-end sin scripts de
curl.

Una UI smoke-minimal hace tres cosas:

1. **Valida la superficie de la API** exponiéndola a los modos
   de falla que un humano realmente encuentra (redirects de auth,
   validación de formulario, render de errores) antes de que las
   capabilities downstream (`transactions`, `fx-cache`,
   `networth-snapshot`) se integren contra ella.
2. **Reduce el riesgo de la UI de producción** dándole al próximo
   change (`ui-accounts` o `pwa-shell`) una referencia funcional
   del typed client de Hono, del patrón de formulario con
   discriminated union, y del widget de `/balance`.
3. **Queda suficientemente chica para entrar en el mismo SDD**.
   Tres páginas de Next.js, ~200–300 líneas en total, sin tests
   (verificación a mano).

La UI smoke no es la UI de producción. No hay shell de navegación,
no hay sistema de temas, no hay botones de edit/archive, no hay
pulido visual. Es un harness de demo en el mismo repo para que la
API se pueda clickear con `pnpm dev`. El trabajo de UI de
producción vive en `ui-accounts` o `pwa-shell`, en changes
separados.

## What

El change se entrega en dos capas que aterrizan en el mismo SDD
pero a lo largo de **tres PRs encadenados** (ver Forecast).

### Layer A — API (sin cambios desde v2)

- Modelo Prisma `FinancialAccount` con 6 tipos, sets de campos por
  tipo, whitelist de monedas `{ ARS, USD, EUR }`, soft archive vía
  `archivedAt`, opening balance híbrido vía discriminated union
  `openingBalanceMode`.
- Endpoints de Hono bajo `/api/accounts`:
  - `GET /api/accounts` — lista paginada con cursor (la UI muestra
    las primeras 50).
  - `POST /api/accounts` — create con validación dirigida por tipo.
  - `GET /api/accounts/:id` — fila completa, incluyendo campos
    específicos del tipo.
  - `PATCH /api/accounts/:id` — update parcial (la UI no lo llama
    en v3).
  - `POST /api/accounts/:id/archive`, `POST /api/accounts/:id/unarchive`
    (la UI no los llama en v3).
  - `GET /api/accounts/:id/balance?displayCurrency=…` — conversión
    FX solo para display vía `FxRateProvider` (la UI sí lo llama).
- Interface `FxRateProvider` declarada en este change; la
  implementación aterriza en el change separado `fx-cache`. El
  storage nunca se toca.
- Strict TDD en la capa de dominio + API (Vitest, RED → GREEN →
  REFACTOR según `openspec/config.yaml`).

### Layer B — UI smoke slice (nuevo en v3)

Tres páginas de Next.js App Router bajo `app/accounts/`, todas en
la misma app de Next.js que `auth-foundation`:

| Path                         | Render mode                              | Purpose                                                                                                     |
| ---------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `app/accounts/page.tsx`      | Server Component                         | Lista las cuentas del usuario autenticado. Lee `GET /api/accounts` vía el typed client de Hono.             |
| `app/accounts/new/page.tsx`  | Server Component shell + Client form     | Form de create dirigido por tipo. Submit a `POST /api/accounts`; redirect a `/accounts` en éxito.           |
| `app/accounts/[id]/page.tsx` | Server Component + Client balance widget | Vista de detalle + form inline que convierte balance vía `GET /api/accounts/:id/balance?displayCurrency=…`. |

Las tres páginas dependen del flow de auth existente en
`/auth/signin`. Sesión faltante → redirect a
`/auth/signin?callbackUrl=…`. No se agrega UI de auth acá.

## Out of scope (este change)

- Sidebar de navegación, app shell, header, footer.
- Botones de edit / archive / unarchive en la UI. `PATCH`,
  `POST /:id/archive`, `POST /:id/unarchive` son solo de API en v3;
  los botones se agregan en `ui-accounts`.
- Librería de componentes Tailwind o design system.
- Skeletons de loading más allá de un string plano `"Loading…"`.
- Tests de la UI. El slice smoke se verifica a mano: developer o
  PM corre `pnpm dev`, se loguea, ejercita las tres páginas.
- Notificaciones por email, jobs programados, workers en
  background.
- Endurecimiento de auth de producción (rate limiting en endpoints
  driven por UI).
- Bulk import / CSV upload.
- `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`
  (cada uno es su propio SDD change).

## Non-goals

- **No es una UI de producción.** Sin auditoría de accesibilidad,
  sin i18n, sin SEO, sin caching de SSR, sin error boundaries más
  allá de `error.tsx`.
- **No reemplaza `ui-accounts` ni `pwa-shell`.** Esos changes
  son dueños del shell, navegación, theming y los formularios de
  producción.
- **No introduce React Hook Form, TanStack Query, ni ninguna
  librería de UI nueva.** El slice usa `useState` + CSS plano
  (ver Decision Gaps por la pregunta de Tailwind).
- **No cambia la superficie de la API.** Cada endpoint, body de
  request, response shape y código de error es exactamente como
  v2 lo especificó.
- **No migra la historia de git de v1/v2.** Ambas branches están
  borradas; sus mensajes de commit quedan en reflog (~30 días).

## Users and situations

| User                          | Situation                                                                | Touchpoint                                        |
| ----------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| Developer                     | Trabajando en `accounts-ledger`; quiere confirmar un fix end-to-end      | `pnpm dev` → sign in → `/accounts` → click around |
| PM                            | Validando la superficie de la API antes de una revisión con stakeholders | Igual que arriba, sin leer código                 |
| Autor futuro de `ui-accounts` | Toma la UI smoke como referencia para typed client + patrones de form    | Lee `app/accounts/*` y el módulo del typed client |
| Usuario autenticado           | Se loguea, lista cuentas, crea una, ve el detalle                        | Las tres páginas                                  |
| Usuario autenticado con FX    | Abre el detalle de una cuenta, convierte a otra moneda                   | El balance widget                                 |

## Business rules

Los IDs estables de v2 se mantienen. Tres reglas nuevas se agregan
en v3 para la UI:

1. **BR-ACC-12 (v2, carried) — FX display contract.** Endpoint
   read-only que convierte el balance nativo a una currency de
   display para el caller. El storage nunca se convierte. El
   contrato retorna `{ native: { amount, currency }, display?:
{ amount, currency, fxRate, fxAsOf }, warnings?: string[] }`.
   Errores: `503 FX_UNAVAILABLE`, `409 FX_NOT_SUPPORTED`.
2. **BR-ACC-13 (v2, carried) — FX rate freshness.** El provider
   retorna la rate con `fxAsOf` aun cuando la rate está stale
   (fin de semana o >24h). La UI muestra `fxAsOf` junto al monto
   convertido para que un humano juzgue la frescura. No es 5xx.
3. **BR-ACC-14 (NEW en v3) — UI redirect rule.** Un server
   component bajo `app/accounts/*` que resuelve una sesión
   faltante DEBE redirigir a
   `/auth/signin?callbackUrl=<original-path>`, encoded con
   `encodeURIComponent`. La regla aplica a las tres páginas.
4. **BR-ACC-15 (NEW en v3) — Form-state discipline.** El form de
   create es un único Client Component. Su estado es local
   (`useState` por campo). El form nunca guarda el usuario
   autenticado, la sesión, ni data server-derived en client
   state. Recibe metadata de campos específicos del tipo vía props
   desde el Server Component shell.
5. **BR-ACC-16 (NEW en v3) — Inline error surface.** Cuando
   `POST /api/accounts` retorna 4xx (validación), el form se
   re-renderiza con un banner de error inline debajo del botón
   submit. El banner muestra el primer mensaje de error del
   campo `error` del response body. 5xx y errores de red
   renderizan un banner genérico `"Something went wrong"`.

## Endpoints

(Todos sin cambios desde v2; se reproducen acá para que la
propuesta sea self-contained.)

| Endpoint                      | Method | Auth     | Notes                                                                           |
| ----------------------------- | ------ | -------- | ------------------------------------------------------------------------------- | --- | ---------------------------------- |
| `/api/accounts`               | GET    | Required | Cursor pagination. `?cursor=<opaque>&limit=<n>`. Default `limit=20`, max `100`. |
| `/api/accounts`               | POST   | Required | Type-driven body. Retorna `201` + la fila creada.                               |
| `/api/accounts/:id`           | GET    | Required | Fila completa. `404` en cross-user.                                             |
| `/api/accounts/:id`           | PATCH  | Required | Update parcial. La UI no lo llama en v3.                                        |
| `/api/accounts/:id/archive`   | POST   | Required | Soft archive. La UI no lo llama en v3.                                          |
| `/api/accounts/:id/unarchive` | POST   | Required | Soft unarchive. La UI no lo llama en v3.                                        |
| `/api/accounts/:id/balance`   | GET    | Required | Display-only FX. `?displayCurrency=ARS                                          | USD | EUR`.`503`/`409` en errores de FX. |

## Data model

(Sin cambios desde v2; se reproduce acá para que la propuesta sea
self-contained.)

```prisma
// prisma/schema.prisma (additive on top of auth-foundation)

enum AccountType {
  BANK
  CREDIT
  INVESTMENT
  CRYPTO
  CASH
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

enum OpeningBalanceMode {
  FRESH          // balance starts at zero on creation date
  HISTORICAL     // balance is back-dated to openingBalanceDate
}

enum AccountCurrency {
  ARS
  USD
  EUR
}

model FinancialAccount {
  id                   String              @id @default(cuid())
  userId               String
  type                 AccountType
  name                 String              // free-text, 1-80 chars
  currency             AccountCurrency
  openingBalanceMinor  Int                 // minor units (cents)
  openingBalanceMode   OpeningBalanceMode
  openingBalanceDate   DateTime?           // required when mode = HISTORICAL
  archivedAt           DateTime?

  // Type-specific fields (only the relevant set is populated per type)
  bankName             String?             // BANK
  accountKind          AccountKind?        // BANK
  issuer               String?             // CREDIT
  creditLimitMinor     Int?                // CREDIT
  statementDay         Int?                // CREDIT (1-31, validated)
  paymentDueDay        Int?                // CREDIT (1-31, validated)
  broker               String?             // INVESTMENT
  investmentType       InvestmentType?     // INVESTMENT
  walletAddress        String?             // CRYPTO (optional)

  createdAt            DateTime            @default(now())
  updatedAt            DateTime            @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, type, name])          // names are unique per user+type
  @@index([userId, archivedAt])           // list view: live accounts first
  @@index([userId, createdAt])            // list view: order by recency
}
```

Notas sobre índices (sin cambios desde v2):

- `@@unique([userId, type, name])` evita que dos cuentas del
  mismo tipo compartan nombre para el mismo usuario.
- `@@index([userId, archivedAt])` alimenta la lista live-first.
- `@@index([userId, createdAt])` alimenta la lista ordenada por
  recencia.

## UI surface (nuevo en v3)

### Páginas

**`app/accounts/page.tsx` — Server Component**

Lee `GET /api/accounts?limit=50` vía el typed client de Hono
(`src/lib/api-client.ts`, creado en este change). Renderiza un
`<table>` HTML con columnas: `Name`, `Type`, `Currency`, `Opening
balance`, `Archived`. El empty state renderiza el string `"No
accounts yet — create one"` con un botón `New account` que linkea
a `/accounts/new`. Si `total > 50`, renderiza un footer chico
`"Showing first 50 of <total>"`. Sesión faltante → redirect a
`/auth/signin?callbackUrl=/accounts` según BR-ACC-14.

**`app/accounts/new/page.tsx` — Server Component + Client form**

El Server shell renderiza un `<form>` y embebe el Client
form component. Los campos del form se renderizan como una **única
UI dirigida por discriminated union**: el usuario elige `type`
primero (un `<select>` con los 6 valores del enum), y debajo se
renderizan los campos específicos del tipo:

| Type         | Type-specific fields                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `BANK`       | `bankName` (text), `accountKind` (select SAVINGS / CHECKING)                                        |
| `CREDIT`     | `issuer` (text), `creditLimit` (number, optional), `statementDay` (1–31), `paymentDueDay` (1–31)    |
| `INVESTMENT` | `broker` (text), `investmentType` (select STOCKS / BONDS / MUTUAL_FUNDS / CERTS_OF_DEPOSIT / OTHER) |
| `CRYPTO`     | `walletAddress` (text, optional)                                                                    |
| `CASH`       | (none)                                                                                              |
| `OTHER`      | (none)                                                                                              |

El dropdown de currency es un `<select>` con `{ ARS, USD, EUR }`.
El opening balance es híbrido: un `<fieldset>` con dos radio
buttons (`fresh` / `historical`). Cuando se selecciona
`historical`, se renderizan dos campos adicionales: `amount`
(number, minor units) y `date` (date input).

El submit llama a `POST /api/accounts` vía el typed client. En
`201`, `router.push('/accounts')`. En 4xx, aplica BR-ACC-16 (banner
de error inline). En 5xx o error de red, el mismo banner con
mensaje genérico.

**`app/accounts/[id]/page.tsx` — Server Component + Client widget**

El Server component lee `GET /api/accounts/:id`. Renderiza la fila
completa, incluyendo los campos específicos del tipo, en un
`<dl>`. El balance widget es un Client Component que muestra el
**native balance** y un form inline (`<form>` con un `<select
name="displayCurrency">` y un botón submit). El submit dispara
`router.refresh()` después de llamar a
`GET /api/accounts/:id/balance?displayCurrency=…`. La response
renderiza `display.amount`, `display.fxRate`, y `display.fxAsOf`
junto al native balance.

Errores:

- `503 FX_UNAVAILABLE` → error inline: `"FX rate provider
unavailable. Try again in a few minutes."`.
- `409 FX_NOT_SUPPORTED` → error inline: `"FX conversion not
supported for this pair."`.

### Typed client

Un wrapper chico y tipado alrededor del client de Hono vive en
`src/lib/api-client.ts`. Re-exporta el `AppType` desde
`src/server/hono/app.ts` (creado en este change) para que la UI
obtenga llamadas type-safe `client.api.accounts.$get(...)`. Sin
abstracción de runtime; solo `hc<AppType>(process.env.NEXT_PUBLIC_API_URL)`.

### Styling

CSS plano vía `app/accounts/accounts.module.css` (un módulo por
página o un módulo compartido — decisión final en `design`). No
se agrega ningún framework de CSS en este change. Ver Decision
Gaps por la pregunta de Tailwind.

### Auth

Las tres páginas resuelven la sesión vía `auth()` de `next-auth`
v5 (ya exportado por `auth-foundation`). Sesión faltante →
`redirect('/auth/signin?callbackUrl=' + encodeURIComponent(pathname))`
según BR-ACC-14. Las páginas nunca leen la cookie de sesión
directamente.

## Decision gaps

Quedan abiertos para la próxima ronda (revisión de propuesta →
confirmación del usuario → escritura de spec). Los defaults están
planteados; el usuario puede overridear en la revisión.

1. **DG-V3-1 — Styling system. ✅ RESUELTO 2026-06-18 (decisión del usuario).**
   La descripción de la tarea referenció "plain Tailwind utility classes",
   pero el proyecto no tenía `tailwindcss` en `package.json`, ni
   `tailwind.config.ts`, ni `postcss.config.*`. **Resolución**: Tailwind
   está en el alcance de este SDD. La fase `sdd-apply` instala
   `tailwindcss` + `@tailwindcss/postcss` (o `tailwindcss` + PostCSS
   config, dependiendo de la decisión de compatibilidad Next.js 16 +
   Tailwind v4 al momento de aplicar — se finaliza en `sdd-design`),
   agrega `postcss.config.mjs`, agrega `tailwind.config.ts` con los
   content paths del proyecto (`./app/**/*.{ts,tsx}`, `./src/**/*.{ts,tsx}`),
   y agrega un `globals.css` con las tres directivas
   `@tailwind base/components/utilities`. El slice UI smoke usa Tailwind
   utility classes para todo el styling. El futuro change `ui-accounts`
   puede extender el design system (theme tokens, primitivos de
   componentes) sin rehacer el setup.
2. **DG-V3-2 — List truncation hint.** Cuando `total > 50`,
   renderizar `"Showing first 50 of <total>"` en el footer de la
   tabla. **Default**: sí, mostrar el count. **Open**: la
   truncación silenciosa también es aceptable.
3. **DG-V3-3 — Empty state copy.** La página de lista renderiza
   `"No accounts yet — create one"` cuando el resultado está
   vacío. **Default**: ese copy exacto en inglés. **Open**: copy
   en español ahora, o localizar más tarde en `ui-accounts`.

## Acceptance criteria

El change está done cuando:

1. `pnpm prisma migrate dev` aterriza la tabla `FinancialAccount`
   con los índices de arriba, y `pnpm prisma studio` muestra la
   tabla en Neon.
2. `pnpm test` corre la suite de dominio + API y sale 0 con
   ≥80% de coverage en `src/modules/accounts/**`.
3. `curl -H "Cookie: authjs.session-token=…" http://localhost:3000/api/accounts`
   retorna la lista paginada con metadata de cursor.
4. `pnpm dev` → sign in → `/accounts` lista cuentas con empty
   state y botón `New account`.
5. El form de `/accounts/new`: los campos dirigidos por tipo
   renderizan correctamente para cada uno de los 6 tipos, el
   dropdown de currency muestra solo `{ ARS, USD, EUR }`, el
   opening balance híbrido alterna entre fresh e historical. El
   submit crea una cuenta y redirige a `/accounts`.
6. `/accounts/[id]` muestra la fila completa y el balance widget.
   Submitir el widget con `displayCurrency=USD` muestra el monto
   convertido, el `fxRate`, y el `fxAsOf`. Submitir cuando
   `fx-cache` está ausente muestra el error inline `503`.
7. Tests de sesión faltante: limpiar la cookie y visitar
   cualquiera de las tres páginas redirige a
   `/auth/signin?callbackUrl=…`.
8. No hay drift en `pnpm-lock.yaml` después de stagear
   `package.json` (Husky pre-commit check según root `AGENTS.md`
   §5.3).
9. `./Documents-es/openspec/changes/accounts-ledger/proposal.md`
   existe con el mismo contenido traducido (sin caracteres
   chinos; verificado según root `AGENTS.md` §3 mirror check).

## Risks

| Riesgo                                                                                    | Mitigación                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| El default plain-CSS (DG-V3-1) se ve sin estilo vs. la intención de Tailwind de la task.  | **Resuelto 2026-06-18**: el usuario aceptó la instalación de Tailwind. La fase apply instala y configura Tailwind; el slice smoke usa utility classes. |
| Scope creep de la UI (botones edit/archive, skeletons, navegación) se filtra al change.   | La sección de out-of-scope es explícita; el trabajo del reviewer es enforcearla.                                                                       |
| `fx-cache` aterriza después de `accounts-ledger` y el balance widget muestra 503 en prod. | El error inline `503` es el comportamiento documentado. El widget se verifica a mano pre-merge.                                                        |
| La historia de git de v2 es irrecuperable (branches borradas).                            | Los mensajes de commit viven en reflog ~30 días; el mensaje de v2 está en `.git/COMMIT_EDITMSG`.                                                       |
| Tres PRs encadenados exceden el budget de revisión de 400 líneas.                         | El auto-forecast acepta el overage (el usuario lo ha hecho antes en `auth-foundation`).                                                                |
| La UI smoke se confunde con production-ready y se envía sin `ui-accounts`.                | Un comment corto `// smoke-minimal, not production` en el header de cada página.                                                                       |

## Rollback

- **PR no mergeado**: `git branch -D feat/accounts-ledger-*`,
  `git worktree remove`.
- **PR mergeado a develop, pre-release**: revertir el merge
  commit. `pnpm prisma migrate reset` es seguro — la tabla
  `FinancialAccount` es aditiva (sin cambios destructivos de
  schema en v2 ni v3). No hay riesgo de user data porque la
  tabla es aditiva.
- **PR released a producción**: stop. Este release se gobierna
  por el release flow (root `AGENTS.md` §5.5) que requiere
  aprobación del usuario. Acá no se documenta un path de
  rollback automático.

## Dependencies

- **Inbound**: `auth-foundation` (shipped). El módulo de auth
  exporta `auth()` desde `src/modules/auth/index.ts`; las páginas
  de UI lo importan directo. La API usa el catch-all de Hono
  montado en `/api/[...path]/route.ts` (también shipped en
  `auth-foundation`).
- **Outbound**: `fx-cache` (futuro). La interface `FxRateProvider`
  se declara en este change; la implementación se envía en
  `fx-cache`. La UI llama a `GET /:id/balance`; si `fx-cache` no
  está, el widget muestra el error inline `503`.
- **Opción co-PR**: `fx-cache` y `accounts-ledger` podrían
  aterrizar como co-PRs si `fx-cache` está listo antes de que
  `accounts-ledger` alcance la fase `apply`. Ordenamiento
  default: `fx-cache` primero o concurrente; nunca después de
  que `accounts-ledger` se envíe.

## Forecast (auto, 400-line budget)

| PR  | Scope                                                                                                                                                                       | Approx. lines | Status |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| 1   | Migración de Prisma + entidades de dominio (enums `AccountType`, `AccountKind`, `InvestmentType`, `OpeningBalanceMode` + modelo `FinancialAccount`) + unit tests de dominio | ~500          | Auto   |
| 2   | Endpoints de Hono (GET/POST/GET-by-id/PATCH/archive/unarchive/balance) + integration tests de API + interface `FxRateProvider`                                              | ~900          | Auto   |
| 3   | Typed client de Hono + 3 páginas de Next.js + slice smoke de CSS plano + espejo en español                                                                                  | ~350          | Auto   |
|     | **Total**                                                                                                                                                                   | **~1750**     |        |

El total excede el budget de revisión de 400 líneas por ~1350
líneas. El usuario ha aceptado overages multi-PR antes en
`auth-foundation` (el change de auth se envió a través de 3 PRs
encadenados de tamaño similar). Esta propuesta no pide una
excepción; documenta el split para que los reviewers sepan qué
esperar.

> El slice smoke de UI son ~200–300 líneas sobre el estimado de
> la API de v2 (~2000 líneas). Total v3: ~2200–2300 líneas a
> lo largo de 3 PRs encadenados. Los números son floor estimates;
> spec/design los va a refinar.

## Audit trail

- **v1** (PR #26, 2026-06-18) — modelo plano, whitelist `{ ARS,
USD }`, único resource `/api/accounts/:id`, sin FX. Cerrado sin
  mergear después de que el usuario expandiera los requisitos a
  mitad de revisión (sub-accounts por banco, múltiples tarjetas
  por issuer, múltiples investment accounts por broker, FX
  display, EUR agregado).
- **v2** (PR #27, 2026-06-18) — estructura por tipo, whitelist
  `{ ARS, USD, EUR }`, enums `accountKind` / `investmentType`,
  `/api/accounts/:id/balance?displayCurrency=…` para FX solo de
  display, interface `FxRateProvider` declarada (impl en
  `fx-cache`). Cerrado sin mergear después de que la revisión de
  UX surfaceara la necesidad de una UI validable a mano antes de
  seguir con más trabajo de API.
- **v3** (esta propuesta) — decisiones de v2 preservadas
  verbatim; nuevo slice smoke-minimal de UI
  (`app/accounts/page.tsx`, `app/accounts/new/page.tsx`,
  `app/accounts/[id]/page.tsx`), typed client de Hono, styling
  con CSS plano, verificación a mano (sin tests de UI). Sin
  cambios en Prisma ni en business rules respecto de v2.

Refs: `openspec/specs/auth/spec.md` (cross-module contracts,
naming collision rule); `openspec/changes/archive/auth-foundation/proposal.md`
(API surface conventions, session reading); `openspec/config.yaml`
(strict TDD rules).
