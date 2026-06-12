# Propuesta — `auth-foundation`

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-10 · **Actualizado**: 2026-06-10 (stack v2: Next.js 16 + Auth.js v5 + Prisma + Neon)
**Slice objetivo**: MVP-1 (capa de identidad)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)

> **Nota v2**: esta es la segunda escritura de esta propuesta. La
> primera versión apuntaba a Bun + Hono (server) + Drizzle + SQLite
> + un subsistema de auth hecho a mano (commit `17c1635`, refinado
> en `b562cee` y `b2a69ec`) y se borró en `eca35c9` después del
> cambio de stack. v1 queda en el historial de git como referencia
> estructural; su contenido es **obsoleto** (JWT custom, refresh
> rotation, Drizzle, SQLite). v2 mantiene la *forma* de v1 (8-9
> secciones, reglas de negocio con IDs estables, tabla de casos
> borde, gaps de decisión, criterios de aceptación) y reemplaza la
> *sustancia* por Auth.js v5 + Prisma + Postgres en Neon.

## Por qué

`gastos-personales` es una app de finanzas multi-usuario. Cada
entidad (Account, Transaction, Snapshot, Category) pertenece a un
`user_id`. Cada endpoint de API necesita identificar al llamador.
La capa de auth es la única dependencia sobre la que se apoya toda
capability (accounts, transactions, fx, snapshots, reports, ui).
Hacerla primero permite que cada cambio posterior asuma que la
identidad está resuelta.

Enviar auth como un cambio separado y aislado también reduce el
presupuesto de review de cada cambio posterior (no hay que
re-validar identidad en cada PR) y aísla el código más sensible
(hashing de passwords, linkeo OAuth, ciclo de vida de sesión) para
que reciba review adversarial dedicado.

## Qué

Un subsistema de identidad autocontenido construido sobre
**Auth.js v5** (`next-auth@beta`) con **`@auth/prisma-adapter`**
para que las sesiones, accounts y verification tokens vivan en
Postgres. El subsistema de auth soporta dos métodos de registro y
un mecanismo de login por usuario, más un catch-all de Hono para la
API de aplicación que no es auth.

| Concern | Responsabilidad |
|---|---|
| Sesiones, CSRF, flujo OAuth, linkeo de accounts | **Auth.js v5** (`/api/auth/*`) |
| Almacenamiento de sesión | **Postgres** vía Prisma adapter (database sessions, no JWT) |
| Registro y login con email + password | **Credentials provider** envolviendo Argon2id en nuestro código |
| Google OAuth 2.0 | **Google provider** configurado en Auth.js |
| API de aplicación (la superficie que no es auth) | **Hono** montado en `/api/[...path]/route.ts` |
| Schema y migraciones | **Prisma 6** + `@prisma/client` |
| Validación | **Zod** en cada borde de acción y en el env schema |

Los dos métodos de identidad (password local, Google OAuth) se
unifican en la entidad `User`: un usuario tiene cero o un
`passwordHash` y cero o más filas `Account` (una por provider
linkeado). Un usuario puede loguearse por cualquier método que
tenga una credencial registrada.

### Endpoints

Auth.js es dueño de las siguientes rutas bajo `/api/auth/*` (los
handlers los genera la librería; nosotros configuramos, no
implementamos):

| Endpoint | Método | Comportamiento |
|---|---|---|
| `/api/auth/signin` | GET | Renderiza la página de sign-in por defecto (formulario de Credentials + botón de Google). |
| `/api/auth/signin/google` | POST | Inicia el flujo Google OAuth 2.0. |
| `/api/auth/callback/google` | GET | Callback de OAuth 2.0. Auth.js intercambia el code, fetch el perfil, corre el callback `signIn`, crea o linkea las filas `User` / `Account`. |
| `/api/auth/callback/credentials` | POST | Recibe `{ email, password }`. Nuestra función `authorize()` busca el user, verifica el hash Argon2id, devuelve el user (o `null`). |
| `/api/auth/session` | GET | Devuelve el JSON de la sesión actual (o `{}` si no está autenticado). Lo usan los client components. |
| `/api/auth/csrf` | GET | Devuelve el token CSRF (Auth.js maneja CSRF para todos los POSTs). |
| `/api/auth/providers` | GET | Devuelve la lista de providers configurados (la usa la UI para renderizar la página de sign-in). |
| `/api/auth/signout` | POST | Revoca la fila de sesión actual en la tabla `Session` y limpia la cookie. |

Application-managed (Hono), también bajo `/api/*`:

| Endpoint | Método | Comportamiento | Auth |
|---|---|---|---|
| `/api/health` | GET | `{ status: "ok", version, uptime }`. Requerido por la skill de deployment. | Público |
| `/api/me` | GET | Devuelve el usuario autenticado (`id`, `email`, `name`, `image`, `defaultProvider`, `lastLoginAt`). Respaldado por `auth()` de `next-auth` v5. | Requerido |

Fuera de alcance de este cambio (se muestran como placeholders
para que la superficie quede visible; viven en cambios posteriores):

| Endpoint | Método | Cambio dueño | Notas |
|---|---|---|---|
| `/api/accounts` | GET, POST | `accounts-ledger` | Lista paginada / crear account. |
| `/api/accounts/:id` | GET, PATCH, DELETE | `accounts-ledger` | |
| `/api/transactions` | GET, POST | `transactions` | |
| `/api/fx` | GET | `fx-cache` | Snapshots de tipo de cambio. |
| `/api/snapshots` | GET, POST | `networth-snapshot` | |
| `/api/reports/*` | GET | `reports-mvp` | |

### Modelo de datos

El schema de Prisma es la única fuente de verdad. Los modelos base
`User` / `Account` / `Session` / `VerificationToken` siguen el
**schema canónico del Auth.js Prisma adapter**
(<https://authjs.dev/reference/adapter/prisma>). Agregamos dos
columnas a `User` que el adapter no trae. Las tablas de Auth.js
(campos, tipos, relaciones) **no se modifican**.

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

model User {
  id              String    @id @default(cuid())
  name            String?
  email           String    @unique
  emailVerified   DateTime?
  image           String?

  // -- Agregado encima del schema canónico de Auth.js --
  passwordHash    String?   // Argon2id hash; null para usuarios OAuth-only
  defaultProvider String    @default("local") // "local" | "google"
  lastLoginAt     DateTime? // populado por el callback `signIn` de Auth.js

  accounts        Account[]
  sessions        Session[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

Índices de `User` (declarados en la próxima migración si no son
implícitos):

- `@@index([email])` — implícito por `@unique`, pero se explicita
  para el reviewer.
- `@@index([createdAt])` — para `user-deletion` y herramientas de
  admin.

Índices de `Account`:

- `@@unique([provider, providerAccountId])` — ya declarado; es la
  única forma de decir "este Google account ya está linkeado".

Índices de `Session`:

- `@@unique([sessionToken])` — ya declarado.
- La columna `expires` se escanea en cada llamada a `auth()`; un
  `@@index([expires])` adicional se agrega en `design` para
  mantener limpio el plan de query.

`passwordHash` es **nullable** porque los usuarios OAuth-only nunca
tienen password local; el `Credentials` provider trata `null` como
"esta cuenta no puede usar el método email + password" (BR-AUTH-9).

### Estrategia de tokens

La app usa **database sessions**, no JWTs emitidos por la app.

- **Cookie de sesión de Auth.js** (`authjs.session-token`,
  HTTP-only, `Secure` en producción, `SameSite=Lax`). La cookie
  guarda un session token opaco; el server lo resuelve contra la
  tabla `Session` en cada request vía `auth()`.
- **Lifetime de sesión**: 30 días (default de Auth.js para database
  sessions; configurable en la config de Auth.js). Sliding window:
  Auth.js extiende el expiry en cada request que encuentra una
  sesión válida, siempre que la sesión se haya usado dentro de las
  últimas 24 horas (BR-AUTH-7).
- **CSRF**: Auth.js patrón double-submit. Todos los POSTs bajo
  `/api/auth/*` requieren el token CSRF de `/api/auth/csrf`.
  Nuestros endpoints de aplicación Hono están **fuera** del CSRF
  de Auth.js; confían en el atributo `SameSite=Lax` de la cookie
  y en POSTs same-origin desde el shell de la app.
- **No hay JWTs para sesiones de app.** Auth.js sí firma
  internamente JWTs de vida corta para el manejo del callback
  OAuth, pero la *aplicación* siempre lee la sesión a través de
  `auth()`, que devuelve la fila de la base. Nunca emitimos,
  verificamos ni almacenamos nuestros propios JWTs en este cambio.
- **No hay refresh tokens emitidos por la app.** La fila `Session`
  es lo único que minteamos, almacenamos y revocamos. "Refresh" es
  el usuario reusando la cookie mientras siga válida; cuando
  expira, el usuario vuelve a iniciar sesión.

### Flujo de auth

**Google OAuth (Auth.js Google provider).** Configuramos el
provider con `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET`, scope
`openid email profile`, y `authorization.params.prompt =
"select_account"`. El flujo completo es de Auth.js:

1. La UI hace POST a `/api/auth/signin/google`.
2. Auth.js redirige el browser a la pantalla de consentimiento de
   Google.
3. Google redirige a `/api/auth/callback/google?code=…`.
4. Auth.js intercambia el code, fetch el userinfo, y llama al
   callback `signIn`.
5. El Prisma adapter crea una fila nueva `User` + `Account` (sin
   match de email) o linkea una fila `Account` nueva al `User`
   existente (match de email → auto-link, BR-AUTH-5). Nuestro
   código de app aporta el callback `signIn`, que estampa
   `lastLoginAt` y se asegura de que `defaultProvider` quede
   seteado en el primer registro.
6. Auth.js setea la cookie de sesión. El usuario está logueado.

**Credentials (email + password).** El flujo es una sola llamada
HTTP:

1. La UI hace POST a `/api/auth/callback/credentials` con
   `{ email, password }` y el token CSRF.
2. Auth.js llama a la función `authorize(credentials, request)` del
   provider (nuestro código, en
   `modules/auth/infrastructure/authjs.ts`).
3. La función:
   - Normaliza el email (lowercase, trim).
   - Busca el `User` por email.
   - Si no lo encuentra **o** `passwordHash` es null, hashea una
     password dummy fija para ecualizar el tiempo de respuesta
     (BR-AUTH-4), y devuelve `null`.
   - Si lo encuentra, verifica la password provista con Argon2id
     contra `passwordHash`. En falla, devuelve `null`.
   - En éxito, devuelve el objeto `User` (solo los campos que
     Auth.js conoce: `id`, `email`, `name`, `image`).
4. Auth.js crea una fila `Session`, setea la cookie, devuelve
   `200`. La UI redirige.

**Lectura de sesión.** Tanto los server components como los
handlers de ruta Hono llaman a `auth()` de `next-auth` v5 (el
helper server-side unificado). El helper devuelve
`{ session, user }` si la cookie es válida, o `null` si no. El
`session.user.id` es la clave de autorización que usa cada
capability posterior.

## Fuera de alcance (este cambio)

- Otros providers de OAuth (Apple, Facebook, GitHub). El schema de
  Prisma ya soporta N providers por user; solo Google sale en MVP.
- Flujo de password reset / verificación de email. Para MVP, el
  password reset es un UPDATE manual en SQL por el operador. La
  verificación de email es un flow respaldado por
  `VerificationToken` en un cambio posterior.
- Multi-factor auth.
- Rate limiting sobre el callback de Credentials. El cambio
  `security-rate-limiting` lo es dueño. Documentado como riesgo
  aceptado en BR-AUTH-12.
- Listado de sesiones / "log out all devices". Fuera de alcance.
  El sign-out revoca solo la sesión actual (BR-AUTH-8).
- ACL genérico encima de `user_id`. Cada cambio posterior maneja
  su propia disciplina de `WHERE user_id = ?`.
- Pantallas de UI (formulario de login, formulario de register,
  botón de OAuth). Son del cambio `ui-auth-shell`. El contrato
  acá es solo la API HTTP.
- Linkeo de account desde el perfil del usuario ("Linkear Google
  a mi cuenta"). El flow existe en el primer login OAuth, pero una
  UI manual de link/unlink es un cambio separado.
- Borrado de usuario / flujos GDPR. Son del cambio `user-deletion`.

## No-objetivos

- **No estamos construyendo un producto de auth-as-a-service.** Sin
  panel admin multi-tenant, sin provisioning de tenants, sin SSO.
- **No introducimos JWTs emitidos por la app.** Las sesiones son
  DB-backed; la aplicación nunca firma, verifica ni almacena un
  JWT.
- **No implementamos verificación de email para signups con
  Google.** Confiamos en el claim `email_verified: true` de
  Google.
- **No mandamos emails de notificación** cuando se autolinkea una
  account.
- **No manejamos cambio de email iniciado por el usuario.** El
  email es el identificador canónico (BR-AUTH-1) y se setea en el
  primer registro.

## Usuarios y situaciones

| Usuario | Situación | Punto de contacto |
|---|---|---|
| Usuario nuevo, local | Llega a la app, quiere trackear finanzas personales | Formulario de register (`ui-auth-shell`) → `authorize` de Credentials |
| Usuario nuevo, Google | Prefiere signup one-click | Botón OAuth (`ui-auth-shell`) → `/api/auth/signin/google` |
| Usuario recurrente, local | Tiene cuenta con password, vuelve días después | Formulario de login → `authorize` de Credentials |
| Usuario recurrente, Google | Tiene cuenta linkeada a Google | Botón OAuth → Google provider |
| Usuario activo, mixto | Se registró local, después linkeó Google | Cualquiera de los dos métodos funciona (auto-link, BR-AUTH-5) |
| Dispositivo comprometido | Quiere invalidar sesiones | Sign out desde ese dispositivo (BR-AUTH-8). "Sign out everywhere" es un cambio posterior. |

## Reglas de negocio

1. **BR-AUTH-1 — El email es el identificador canónico.** Sin
   usernames. El email se normaliza (lowercased, trimmed) antes
   del almacenamiento y la búsqueda. La comparación es
   case-insensitive.
2. **BR-AUTH-2 — El password local tiene mínimo 10 caracteres.**
   Sin reglas de complejidad más allá del largo (NIST SP
   800-63B). Se enforza en el schema de Zod en el borde de la
   acción de register.
3. **BR-AUTH-3 — Parámetros de Argon2id.** Tuneados a ~50-100 ms
   de tiempo de hash en la VM 1-CPU de Fly.io. Los parámetros
   finales (memoryCost, timeCost, parallelism) se deciden en
   `design`; el baseline de v1 de la propuesta es
   `memoryCost=19456`, `timeCost=2`, `parallelism=1`, y se va a
   re-benchmarkear en `design`.
4. **BR-AUTH-4 — La enumeración de usuarios se mitiga en la
   función `authorize()` de Credentials.** Cuando el email no
   existe, o el user no tiene `passwordHash`, la función hashea
   una password dummy fija con los mismos parámetros de Argon2id
   antes de devolver `null`. El tiempo de respuesta para "email
   desconocido" y "password incorrecta" es estadísticamente
   indistinguible.
5. **BR-AUTH-5 — Auto-link on email match.** Cuando Google
   devuelve un email que ya existe en `User`, Auth.js crea una
   fila `Account` nueva linkeada al `User` existente. No se
   pide password. La fila `User` mantiene sus datos existentes.
6. **BR-AUTH-6 — El `email_verified: true` de Google es de
   confianza.** El Google provider de Auth.js lo enforza: si el
   claim es `false`, el flujo OAuth falla y Auth.js devuelve un
   error.
7. **BR-AUTH-7 — La expiración de sesión es 30 días, con sliding
   window.** Default de Auth.js para database sessions. El expiry
   se extiende en cada request que encuentra una sesión válida,
   siempre que la sesión se haya usado dentro de las últimas 24
   horas.
8. **BR-AUTH-8 — El sign-out revoca solo la sesión actual.**
   Auth.js borra la fila `Session` cuyo `sessionToken` matchea
   la cookie y limpia la cookie. Los otros dispositivos siguen
   funcionando. "Sign out everywhere" está fuera de alcance para
   MVP.
9. **BR-AUTH-9 — El lookup de Credentials requiere
   `passwordHash` seteado.** Si el user se creó vía OAuth y nunca
   seteó password, `passwordHash` es `null`. La función
   `authorize()` devuelve `null` (con la ecualización de timing
   de BR-AUTH-4) y la UI muestra "esta cuenta usa Google
   sign-in".
10. **BR-AUTH-10 — Unicidad de linkeo de account.** La
    constraint `@@unique([provider, providerAccountId])` en
    `Account` previene que el mismo Google account se linkee a
    dos users. Si un actor malicioso intentara linkear su Google
    a la cuenta de una víctima, el segundo link falla y Auth.js
    devuelve un error `OAuthAccountNotLinked`.
11. **BR-AUTH-11 — Sin secretos, tokens, ni material de password
    en logs.** El path de verificación Argon2id, el path de
    resolución de sesión, y los callbacks de Auth.js loguean
    solo `userId` (o `null`) y el outcome. La capa de
    structured logging en `core/logging` se configura con una
    denylist de `{ password, passwordHash, sessionToken,
    access_token, refresh_token, id_token, csrfToken }`.
12. **BR-AUTH-12 — Los intentos fallidos de login no se
    rate-limitan en MVP.** Documentado como riesgo aceptado. El
    cambio `security-rate-limiting` es dueño de los rate limits
    per-IP y per-account sobre `/api/auth/callback/credentials`.
    Mitigación mientras tanto: BR-AUTH-4 ecualiza el timing, así
    un atacante de fuerza bruta no puede distinguir "no existe
    el user" de "existe, password incorrecta" por latencia.
13. **BR-AUTH-13 — `defaultProvider` se setea en el primer
    registro** y nunca cambia. Para Credentials → `"local"`. Para
    Google → `"google"`. El campo lo lee `GET /api/me` para
    renderizar el hint de "último método de sign-in" en la UI.
14. **BR-AUTH-14 — La normalización de email es irreversible.**
    El email original (sin normalizar) nunca se almacena. El
    `email_verified` de Google se valida sobre la forma
    normalizada. Si un user después cambia su email, eso es un
    cambio separado.

## Implicaciones e impacto

| Área | Impacto |
|---|---|
| **Base de datos** | Nuevas tablas Postgres generadas por el Auth.js Prisma adapter: `User`, `Account`, `Session`, `VerificationToken`. Agregamos `passwordHash`, `defaultProvider`, `lastLoginAt` a `User`. Las tablas de Auth.js no se modifican a mano. Provider: `postgresql`. |
| **Migraciones** | `prisma migrate dev` local; `prisma migrate deploy` en el startup del container o vía un release command en Fly.io (decidido en `fly-deploy`). |
| **Superficie de API** | 7 rutas manejadas por Auth.js bajo `/api/auth/*` (handlers generados por la librería) + 2 rutas de aplicación bajo `/api/*` (`/api/health`, `/api/me`). El catch-all de Hono se monta en `app/api/[...path]/route.ts` y solo maneja `/api/me` y `/api/health` en este cambio. Cambios posteriores agregan `/api/accounts/*`, `/api/transactions/*`, etc. bajo el mismo catch-all. |
| **Estado de Auth.js v5** | `next-auth@beta` es la versión que todos usan en 2026. Sigue etiquetada como beta. Mitigación: pinear la versión exacta, watch de releases, plan para upgradear a stable cuando salga. |
| **Capa de dominio** | Nuevo módulo `auth`: entidades `User`, `Account`, `Session`; `AuthService` con `me()`, `signOut()`, `assertSession()`. Cross-module: emite `UserRegistered` (solo en el primer registro) y `UserSignedIn` (en cualquier sign-in exitoso) sobre el event dispatcher in-process. |
| **Capa de aplicación** | Las acciones de auth orquestan servicios + DTOs. Handlers de ruta Hono bajo `app/api/[...path]/route.ts` para `/api/me` y `/api/health`. |
| **Infraestructura** | `@auth/prisma-adapter`, `argon2` (o implementación de Argon2id equivalente nativa de Node 20+), `@node-rs/argon2` es el candidato elegido; decidido en `design`. Env schema de Zod validado en el startup (skill env-config). |
| **Eventos cross-module** | `UserRegistered` (primer registro, cualquier método) y `UserSignedIn` (cualquier sign-in exitoso). Los consumers downstream se pueden suscribir — por ejemplo, para seedear categorías default. Fuera de alcance implementar consumers en este cambio. |
| **UI** | Nada en este cambio. Los endpoints de Hono y las rutas de Auth.js son server-side. La UI es `ui-auth-shell`. |
| **CI / deploy** | Sin deploy en este cambio. Solo tests locales. Nuevos secrets cuando llegue el deploy: `AUTH_SECRET` (el secret propio de Auth.js usado para firmar cookies y tokens CSRF), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `DATABASE_URL`. El env schema en `config/env.schema.ts` valida los cuatro en el startup. |
| **Docs bilingües** | Esta propuesta + spec + design espejadas en `Documents-es/openspec/...`. |
| **Package manager** | `pnpm` únicamente. El lockfile es `pnpm-lock.yaml`. CI usa `pnpm install --frozen-lockfile` vía `actions/setup-node` con `corepack` habilitado. `npm` y `yarn` están prohibidos. |
| **Riesgo de seguridad (documentado)** | **Auto-link on email match** significa que quien controle un email controla la cuenta (BR-AUTH-5). Comportamiento estándar de la industria (Notion, Linear, Vercel). Mitigación diferida a un pase de hardening. |
| **Hono dentro de Next.js** | Hono se monta como una única catch-all route en `app/api/[...path]/route.ts`. No obtenemos el routing file-based de Next.js para nuestra API de aplicación. Mitigación: se usa el cliente tipado `hc` de Hono desde la UI para llamadas a `/api/*`, y se exporta una instancia `OpenAPIHono` en `app/api/[...path]/handler.ts` para consumo tipado. |
| **Neon cold start** | La primera conexión en el free tier puede ser ~500 ms. Mitigación: warm up vía un request programado desde el cron de Fly, o aceptar la latencia en MVP. |

## Casos borde (producto)

| Escenario | Comportamiento |
|---|---|
| Register local con email ya usado | `authorize()` de Credentials devuelve `null` (el path de register es del cambio `ui-auth-shell`; acá el contrato es la API de auth). La UI muestra "ya existe una cuenta con este email — probá iniciando sesión". |
| Register local con email vacío | `400 VALIDATION_ERROR` del schema de Zod. |
| Register local con password de 5 chars | `400 VALIDATION_ERROR` (`PASSWORD_TOO_SHORT` según BR-AUTH-2). |
| Login local con password incorrecta | `authorize()` de Credentials devuelve `null` → `401` de Auth.js. |
| Login local con email inexistente | Igual que password incorrecta: `null` + dummy-hash timing (BR-AUTH-4). |
| Login local con `passwordHash` null (user Google-only) | `null` + dummy-hash timing (BR-AUTH-9). La UI muestra "usá Google sign-in". |
| Callback OAuth con token de Google revocado | Auth.js surface `OAuthSignInError`. El usuario vuelve a la página de sign-in con un error genérico. |
| OAuth devuelve `email_verified: false` | El Google provider de Auth.js rechaza el flujo (BR-AUTH-6). |
| OAuth devuelve email ya linkeado al **mismo** user | Re-login. No se crea `User` nuevo ni `Account` nuevo. Se crea la fila de sesión. |
| OAuth devuelve email linkeado a un **user distinto** | Auto-link al user existente (BR-AUTH-5). Fila `Account` nueva. Fila de sesión creada. |
| Subject de OAuth ya linkeado a un user con **email distinto** | Error `OAuthAccountNotLinked`. La unique constraint en `Account(provider, providerAccountId)` lo atrapa (BR-AUTH-10). El user debe iniciar sesión con el email que originalmente reclamó el Google account. |
| User logueado con Google hoy, mañana inicia sesión con Credentials | Funciona: el mismo `User` tiene tanto `passwordHash` (seteado por register-local) como una fila `Account` (seteada por Google). Cualquiera de los dos métodos resuelve al mismo `userId`. |
| User logueado solo con Google (nunca seteó password), prueba Credentials | `null` + dummy-hash timing (BR-AUTH-9). La UI muestra "usá Google sign-in". |
| Cookie de sesión expirada | `auth()` devuelve `null`. La UI redirige a sign-in. No hay 401 en la URL — el usuario solo ve el form de sign-in. |
| Cookie de sesión válida, fila de sesión en DB inexistente | `auth()` devuelve `null`. Tratado como expirada. La cookie se limpia en el próximo sign-in. |
| Google cambia el email del usuario | La fila `Account` está keyada en `providerAccountId` (el `sub` de Google), no en email. El link sobrevive. **Pregunta abierta**: si `User.email` debería actualizarse al nuevo email de Google. Trackeado en gaps de decisión. |
| La librería de Argon2id no carga | `500 INTERNAL_ERROR` desde `/api/auth/callback/credentials`. Logueado con stack, nunca expuesto en la respuesta. |
| DB inalcanzable durante `authorize()` | `500 INTERNAL_ERROR`. Un retry con conexión fresca. Sin backoff exponencial en MVP. |
| API de Google OAuth caída | `502 OAUTH_PROVIDER_UNAVAILABLE` desde el mapeo de errores de Auth.js. La UI muestra "Google no está disponible, reintentá". |
| Sign-in concurrente desde dos dispositivos | Cada uno obtiene su propia fila `Session`. Sin contención. Sign-out en device A deja la sesión de device B intacta (BR-AUTH-8). |
| Restart del server con sesiones activas | Las sesiones viven en Postgres. Sin pérdida de sesión. Latencia de cold-start solo en el primer request (ver fila de Neon en implicaciones). |
| User con 5+ providers de OAuth en el futuro | El schema lo soporta (una fila `Account` por provider por user). El campo `providers` que devuelve Auth.js es dinámico. |

## Gaps de decisión (abiertos para la próxima ronda)

| Pregunta | Default si no se responde | Cómo resolver |
|---|---|---|
| ¿`User.email` se actualiza cuando Google devuelve un email nuevo? | No (mantenemos el original). Documentar en `design` y mostrarlo en la UI. | Verificar el comportamiento de Auth.js v5 en `design`; decidir. |
| ¿Las updates de `lastLoginAt` van por el callback `signIn` de Auth.js o por un Prisma middleware? | Callback `signIn` de Auth.js. | Agregar a `design`. |
| ¿Exponemos la `/api/auth/session` built-in de Auth.js o la wrapeamos con un endpoint Hono? | Exponemos la ruta built-in de Auth.js directamente. El shape es estable. | Confirmar en `design`; flag si hace falta el wrapeo Hono para un campo custom. |
| Sliding window de sesión: 24h (default de Auth.js) o menos? | 24h. | Ajustar en `design` si el feedback de UX dice otra cosa. |
| ¿Qué pasa con las otras sesiones cuando cambia la password? | Nada en MVP. Sobreviven hasta que expiren. | Cambio separado si producto lo quiere. |
| ¿Mandamos email de notificación en el auto-link? | No (fuera de alcance). | Trackear para más adelante. |
| ¿Necesitamos UI de "switch account" para users con múltiples providers OAuth? | No. La UI muestra un provider a la vez. | Trackear para más adelante si producto lo quiere. |
| Librería de Argon2id: `argon2` (native) vs. `@node-rs/argon2`? | `@node-rs/argon2` (sin node-gyp, binarios prebuilt para Alpine). | Benchmark en `design`. |

## Aceptación (evidencia que verá el reviewer)

1. **Tests pasan**: `pnpm test` (o `pnpm vitest`) sale con 0.
   Coverage del módulo `auth` ≥ 80% (línea + branch). El mínimo
   que tiene que estar cubierto es `authorize()` de Credentials y
   el helper server-side `auth()`.
2. **Smoke manual**: `pnpm run dev` →
   - Register local vía el callback de Credentials, después
     iniciar sesión con el mismo email + password. La cookie de
     sesión queda seteada.
   - Iniciar sesión con Google contra un cliente OAuth de test
     (`accounts.google.com` con el test client ID/secret).
   - Pegarle a `GET /api/me` con la cookie de sesión; la
     respuesta es el user autenticado.
   - Sign out; la cookie de sesión se limpia; `GET /api/me`
     devuelve `null`.
   - `GET /api/health` devuelve `{ status: "ok", version, uptime }`.
3. **Review adversarial**: un subagente `reviewer` audita el diff
   con foco en:
   - Enumeración de users en `authorize()` de Credentials
     (BR-AUTH-4).
   - Material de password en logs (BR-AUTH-11).
   - Elección de parámetros de Argon2id en la VM target
     (BR-AUTH-3).
   - Modelo de seguridad de auto-link (BR-AUTH-5).
   - Unique constraint de `Account` y el caso borde "OAuth subject
     linkeado a email distinto" (BR-AUTH-10).
   - Confianza en `email_verified` de Google (BR-AUTH-6).
   - Expiración de sesión y sliding window (BR-AUTH-7).
   - Tipado de Hono dentro de Next.js (sin tipos de route a
     nivel Next.js para `/api/*`).
4. **GGA**: `gga run` sale con 0. Output pegado en el handoff.
5. **Docs bilingües**: `openspec/changes/auth-foundation/proposal.md`
   y `Documents-es/openspec/changes/auth-foundation/proposal.md`
   están en sync. Drift detection corre en el mismo commit.
6. **Doc de arquitectura actualizado**: `docs/architecture.md`
   (espejo en `Documents-es/docs/`) gana una sección "Auth" a la
   que esta propuesta linkea.

## Riesgos (mitigados)

| Riesgo | Mitigación |
|---|---|
| Auth.js v5 está en beta | Pinear la versión exacta de `next-auth@beta`. Watch de releases. Plan para upgradear a stable cuando salga. |
| Cold start de Neon en free tier (~500 ms primera conexión) | Aceptable en MVP. Mitigación diferida a `fly-deploy`: un request programado calienta la conexión. |
| Hono montado dentro del route handler de Next.js significa que no obtenemos el tipado de rutas built-in de Next.js para nuestra API | Usar el cliente tipado `hc` de Hono desde la UI. Exportar una instancia `OpenAPIHono` para consumo tipado. |
| `pnpm` no instalado en CI | `actions/setup-node` habilita `corepack`, que aprovisiona `pnpm` desde `packageManager` en `package.json`. CI usa `pnpm install --frozen-lockfile`. |
| Parámetros de Argon2id demasiado lentos o demasiado rápidos en 1-CPU de Fly.io | Benchmark en `design`. La llamada a `argon2.verify` tiene que completar en 50-100 ms. |
| Migraciones de Prisma sobre branching de Neon | `prisma migrate deploy` es idempotente y seguro de correr en cada startup del container. La decisión final (startup hook vs. release command) se difiere a `fly-deploy`. |
| Auto-link on email match es un riesgo de seguridad | Estándar de la industria. Documentado en BR-AUTH-5 y en la matriz de implicaciones. Pase de hardening trackeado. |
| `email_verified: false` aceptado por error | El Google provider de Auth.js lo enforza; verificado en design. |
| `passwordHash` logueado por accidente | La denylist de structured logging (BR-AUTH-11) lo cubre. Regla de lint prohíbe `console.log` en `modules/auth/`. |

## Ordenamiento de cambios downstream

Después de este cambio, los siguientes quedan desbloqueados:

1. `accounts-ledger` — necesita `user_id` y el helper server-side
   `auth()` para extraerlo.
2. `fx-cache` — independiente de auth, pero ordenada acá por
   coherencia de "infra helpers".
3. `networth-snapshot` — depende de `accounts-ledger`.
4. `reports-mvp` — depende de `accounts-ledger` +
   `networth-snapshot` + `fx-cache`.
5. `ui-auth-shell` — depende de `auth-foundation`. Renderiza el
   form de sign-in, el form de register, el botón de OAuth, y el
   mensaje fallback "usá Google sign-in".
6. `pwa-shell` — depende de `ui-auth-shell` y al menos un
   recurso protegido.
7. `security-rate-limiting` — depende de `auth-foundation`. Agrega
   rate limits per-IP y per-account sobre
   `/api/auth/callback/credentials`.
8. `user-deletion` — depende de `auth-foundation`. Dueña del
   borrado de datos GDPR-style del user y limpieza de filas
   `Session`.
9. `fly-deploy` — independiente; cae al final.

## Próximo paso

Aprobar esta propuesta para desbloquear `sdd-spec` (deltas de spec
para la capability `auth`) y `sdd-design` (decisiones sobre
parámetros de Argon2id, elección de librería de Argon2id, shape
del callback `signIn` de Auth.js, exportación del cliente tipado
de Hono, mapeo de error codes).
