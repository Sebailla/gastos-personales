# Spec — capability `auth`

**Autor**: Sebastián Illa
**Capability**: `auth`
**Cambio fuente**: `auth-foundation`, `auth-foundation-slice-c`
**Estado**: activo · **Creado**: 2026-06-10 · **Última sincronización**: 2026-06-14 (Slice C)
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Hono catch-all + Zod

> **Nota v2**: esta es la segunda escritura de este spec. La
> primera versión apuntaba a Bun + Hono (server) + Drizzle +
> SQLite + un subsistema de auth hecho a mano (commit `b562cee`,
> con propuesta en `17c1635`) y se borró en `eca35c9` después
> del cambio de stack. v1 queda en el historial de git como
> referencia estructural; su contenido es **obsoleto** (JWT
> custom, refresh-token rotation, Drizzle, SQLite). v2 mantiene
> la _forma_ de v1 (8 secciones, reglas de negocio con IDs
> estables `BR-AUTH-NN`, tabla exhaustiva de códigos de error,
> garantías de seguridad, contratos cross-module) y reemplaza
> la _sustancia_ por sesiones en base de datos vía Auth.js v5,
> el Prisma adapter y el Hono catch-all que aloja la API de
> aplicación.

## Propósito

La capability `auth` es la capa de identidad de
`gastos-personales`. Gestiona las cuentas de usuario, sus
contraseñas locales, sus vínculos con proveedores de identidad
de terceros (Google OAuth 2.0 en este cambio) y las
credenciales de acceso que prueban identidad en llamadas
posteriores. Garantiza que: (a) un usuario registrado puede
autenticarse por cualquiera de los métodos de credencial que
haya registrado, (b) un llamador prueba su identidad
presentando una cookie HTTP-only `authjs.session-token` válida
que el servidor resuelve contra la tabla `Session` en
Postgres, (c) las credenciales se almacenan usando primitivas
estándar de la industria (Argon2id para contraseñas) y nunca
aparecen en logs, errores ni cuerpos de respuesta, y (d)
cada otro módulo puede confiar en que `userId` está presente y
es confiable en cualquier request que pase exitosamente por el
helper server-side `auth()` de Auth.js v5.

La identidad vive en el módulo `auth` bajo
`src/modules/auth/{domain,application,infrastructure}/...`,
respaldado por la librería Auth.js v5
(`next-auth@5.0.0-beta.X`), el **`@auth/prisma-adapter`** para
el almacenamiento de sesiones, el Hono catch-all en
`app/api/[...path]/route.ts` para los endpoints de aplicación
que no son auth, y Zod para cada frontera de esquema (cuerpos
de request, variables de entorno, value objects de dominio).

## Entidades

El modelo de datos sigue el **schema canónico del Auth.js
Prisma adapter**
(<https://authjs.dev/reference/adapter/prisma>) para `User`,
`Account`, `Session` y `VerificationToken`. Se agregan tres
columnas a `User` por encima del schema canónico del adapter.
Las tablas de Auth.js (sus campos, tipos y relaciones) NO
DEBEN modificarse a mano.

### `User`

La identidad canónica del sistema. Un usuario posee cero o
una contraseña local y cero o más vínculos con proveedores
OAuth. Cada otra entidad (Account, Transaction, Category,
Snapshot, etc.) referencia a un `User` mediante `userId` (el
campo `id` de Auth.js; ver BR-AUTH-1).

| Campo             | Tipo                           | Restricciones                                                                                                                                                                               |
| ----------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`              | `string` (cuid)                | Primary key. Generado server-side.                                                                                                                                                          |
| `name`            | `string \| null`               | Nombre a mostrar. Opcional.                                                                                                                                                                 |
| `email`           | `string`                       | Único. Lowercase + trim antes de almacenar. Comparación case-insensitive.                                                                                                                   |
| `emailVerified`   | `DateTime \| null`             | `null` para signups locales (no hay flujo de verificación de email en MVP); `DateTime` para signups de Google (se setea en el callback OAuth, ya que Auth.js exige `email_verified: true`). |
| `image`           | `string \| null`               | URL de la foto de perfil de Google. `null` para usuarios solo locales.                                                                                                                      |
| `passwordHash`    | `string \| null`               | Forma codificada Argon2id. `null` para usuarios solo OAuth (BR-AUTH-9). Nunca viaja por la API.                                                                                             |
| `defaultProvider` | `'local' \| 'google'` (string) | Credencial usada en el primer registro. Se setea una vez, nunca se muta (BR-AUTH-13).                                                                                                       |
| `lastLoginAt`     | `DateTime \| null`             | Tildado por el callback `signIn` de Auth.js en cada sign-in exitoso.                                                                                                                        |
| `createdAt`       | `DateTime`                     | Se setea en el insert.                                                                                                                                                                      |
| `updatedAt`       | `DateTime`                     | Se actualiza en cada mutación.                                                                                                                                                              |

Invariantes:

- `id` es inmutable.
- `email` es inmutable en MVP. Un flujo de cambio de email es
  un cambio aparte.
- `passwordHash` es `null` para usuarios registrados
  exclusivamente vía Google. La función `authorize()` del
  provider Credentials devuelve `null` (con igualación de
  timing por hash dummy, BR-AUTH-4) cuando `passwordHash` es
  `null` (BR-AUTH-9).
- `defaultProvider` se setea en el primer registro exitoso y
  nunca se muta después, incluso si el usuario vincula luego
  un segundo proveedor (BR-AUTH-13).
- `lastLoginAt` se actualiza desde el callback `signIn` de
  Auth.js, no desde código de aplicación.

Ciclo de vida:

- **Creado** en `POST /api/auth/register` (Credentials) o en
  el primer callback OAuth de Google exitoso para un email no
  visto previamente.
- **Leído** en cada llamada server-side a `auth()` (el helper
  resuelve la fila de sesión y devuelve la proyección del
  usuario).
- **No eliminado** en este cambio. Un cambio futuro
  `user-deletion` maneja la limpieza estilo GDPR y elimina en
  cascada las filas de `Account` y `Session` (por la
  relación `onDelete: Cascade` del schema Prisma).

### `Account`

Vínculo entre un `User` y un proveedor de identidad externo,
siguiendo la forma canónica de Auth.js. Este cambio envía
`provider = 'google'`. El modelo de datos soporta
proveedores adicionales en cambios futuros sin migración de
schema.

| Campo               | Tipo                          | Restricciones                                                                                                |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `id`                | `string` (cuid)               | Primary key.                                                                                                 |
| `userId`            | `string` (cuid)               | Foreign key a `User.id`. `onDelete: Cascade`. Indexado implícitamente por la relación.                       |
| `type`              | `string`                      | Tipo de cuenta Auth.js (ej. `"oidc"` para Google, `"email"` para el provider credentials en algunos flujos). |
| `provider`          | `string`                      | Identificador del proveedor (`"google"` en este cambio).                                                     |
| `providerAccountId` | `string`                      | El `sub` opaco y estable del proveedor.                                                                      |
| `refresh_token`     | `string \| null` (`@db.Text`) | Credencial de refresh del access token de Google.                                                            |
| `access_token`      | `string \| null` (`@db.Text`) | Access token de Google.                                                                                      |
| `expires_at`        | `Int \| null`                 | Unix seconds en que expira el access token de Google.                                                        |
| `token_type`        | `string \| null`              | `token_type` de Google (típicamente `"Bearer"`).                                                             |
| `scope`             | `string \| null`              | Scopes separados por espacio que Google otorgó.                                                              |
| `id_token`          | `string \| null` (`@db.Text`) | `id_token` OIDC de Google.                                                                                   |
| `session_state`     | `string \| null`              | Estado interno de Auth.js.                                                                                   |

Invariantes:

- Restricción unique sobre `(provider, providerAccountId)`
  (BR-AUTH-10).
- `providerAccountId` (el `sub` de Google) es la única clave
  de vínculo. El `email` del usuario puede cambiar en Google
  sin romper el vínculo (ver decision gap 1 en la propuesta).
- Un usuario PUEDE tener como máximo una fila de `Account`
  por `provider` en MVP. El schema soporta múltiples filas
  por usuario mientras `provider` difiera.

Ciclo de vida:

- **Creado** en el primer callback OAuth de Google exitoso
  para un `(provider, providerAccountId)` dado. Como `User`
  nuevo (sin match de email) o vinculando al `User` existente
  por match de email (BR-AUTH-5, "auto-link on email match").
- **Leído** por Auth.js internamente para resolver las
  sesiones OAuth.
- **No eliminado ni actualizado** por código de aplicación.
  Flujos de unlink son un cambio aparte.

### `Session`

Fila de sesión server-side. La aplicación NUNCA emite,
verifica ni almacena sus propios JWTs. El session token
opaco en la cookie `authjs.session-token` se busca contra
esta tabla en cada llamada a `auth()`.

| Campo          | Tipo            | Restricciones                                                                                                                                                    |
| -------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | `string` (cuid) | Primary key.                                                                                                                                                     |
| `sessionToken` | `string`        | Único. El token opaco que Auth.js guarda en la cookie.                                                                                                           |
| `userId`       | `string` (cuid) | Foreign key a `User.id`. `onDelete: Cascade`.                                                                                                                    |
| `expires`      | `DateTime`      | Expiración de la sesión. Default 30 días desde la emisión. Sliding: Auth.js la extiende en cada request dentro de las últimas 24 horas de actividad (BR-AUTH-7). |

Índices (declarados en la migración que se envía con el
design):

- `@@unique([sessionToken])` — implícito por `@unique`.
- `@@index([expires])` — agregado para mantener limpio el
  plan de "garbage-collect de sesiones expiradas". `auth()`
  lee la fila por `sessionToken` (clave primaria del lookup),
  pero la limpieza periódica se beneficia del índice.

Invariantes:

- Una sesión está **activa** si y solo si la fila existe y
  `expires > now()`. El Prisma adapter lo enforce
  transparentemente.
- Las filas de sesión se eliminan cuando el usuario hace
  sign-out (BR-AUTH-8) o cuando se elimina el usuario
  (`onDelete: Cascade`).

Ciclo de vida:

- **Creada** por Auth.js en cada sign-in exitoso (ambos
  providers).
- **Leída** por `auth()` en cada llamada server-side que
  necesita la sesión.
- **Eliminada** en sign-out (BR-AUTH-8 — solo la sesión
  actual; "cerrar sesión en todos los dispositivos" está
  fuera de alcance para MVP).
- **Garbage-collected** por un job periódico en background
  (cambio aparte); fuera de alcance aquí.

### `VerificationToken`

Sin uso en MVP. La tabla DEBE existir porque el schema
canónico del Auth.js adapter la incluye; los providers
Credentials y Google no escriben en ella. El flujo de
`email-verification` (un cambio aparte) la usará.

| Campo        | Tipo       | Restricciones                              |
| ------------ | ---------- | ------------------------------------------ |
| `identifier` | `string`   | El email o user id esperando verificación. |
| `token`      | `string`   | Único. El token opaco.                     |
| `expires`    | `DateTime` | Expiración del token.                      |

Índices: `@@unique([identifier, token])`.

## Endpoints

Todos los endpoints viven bajo el prefijo `/api/*`. Auth.js
es dueño de `/api/auth/*` (handlers generados por la
librería; configuramos, no implementamos). Hono es dueño del
resto vía el catch-all `app/api/[...path]/route.ts`. Todos
los cuerpos de request y response para los endpoints de Hono
son JSON. Todos los endpoints de Hono que mutan estado
validan el header `Origin` contra una allowlist (skill
security-owasp; mitigación de CSRF en la sección
§Security guarantees del spec).

### De Auth.js (`/api/auth/*`)

| Endpoint                         | Método | Comportamiento                                                                                                                                                            |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/auth/signin`               | GET    | Renderiza la página de sign-in por defecto (form de Credentials + botón de Google). La página custom en `/auth/signin` la monta el cambio `ui-auth-shell`.                |
| `/api/auth/signin/google`        | POST   | Inicia el flujo OAuth 2.0 de Google. Auth.js redirige el browser a la pantalla de consentimiento de Google con `prompt=select_account`, `scope=openid email profile`.     |
| `/api/auth/callback/google`      | GET    | Callback OAuth 2.0. Auth.js intercambia el code, fetcha el userinfo, ejecuta el callback `signIn`, crea o vincula filas de `User` / `Account`, setea la cookie de sesión. |
| `/api/auth/callback/credentials` | POST   | Recibe `{ email, password }` + token CSRF. Auth.js llama a nuestro `authorize(credentials, request)`. Devuelve `200` con cookie de sesión en éxito, `401` en fallo.       |
| `/api/auth/session`              | GET    | Devuelve el JSON de la sesión actual (`{ user, expires }` o `null`). Lo usan los client components para arrancar el estado de sesión.                                     |
| `/api/auth/csrf`                 | GET    | Devuelve el token CSRF. Auth.js maneja CSRF para todos los POST bajo `/api/auth/*` (patrón double-submit).                                                                |
| `/api/auth/providers`            | GET    | Devuelve la lista de providers configurados (`[{ id: "google" }, { id: "credentials" }]`). Lo usa la UI para renderizar la página de sign-in.                             |
| `/api/auth/signout`              | POST   | Revoca la fila de sesión actual en la tabla `Session` y limpia la cookie `authjs.session-token`. Los otros dispositivos siguen funcionando (BR-AUTH-8).                   |

Para cada ruta de Auth.js, los shapes de request/response y
los status codes son de la librería. Las customizaciones que
aplicamos:

- **Página de sign-in custom** en `/auth/signin` (montada por
  el cambio `ui-auth-shell`). Auth.js se configura con
  `pages.signIn = "/auth/signin"`. La ruta es una página de
  Next.js, NO un endpoint de Hono.
- **Página de sign-out custom** en `/auth/signout` (mismo
  cambio, misma config `pages.signOut`).
- **Callback `signIn`** que tilda `lastLoginAt` y
  `defaultProvider` (BR-AUTH-13) en el primer registro.
- **Callback `session`** que garantiza que
  `session.user.id` esté siempre presente y que
  `defaultProvider` se incluya en el JSON de sesión para
  renderizar en el cliente.

### De aplicación (Hono, bajo `/api/*`)

Montado en `app/api/[...path]/route.ts`. La app de Hono
exporta handlers `{ GET, POST, PATCH, DELETE }` que delegan a
`honoApp.fetch(request)`. Auth.js NO se enruta a través de
Hono; la ruta más específica en
`app/api/auth/[...nextauth]/route.ts` toma precedencia en la
capa de Next.js.

**Precedencia de enrutamiento del catch-all**: el routing
file-based de Next.js matchea
`app/api/auth/[...nextauth]/route.ts` **antes** que
`app/api/[...path]/route.ts` (el path más específico gana).
El `app.fetch` de Hono **nunca** ve requests a `/api/auth/*`
porque esos son interceptados por el handler de Auth.js.
El catch-all sólo maneja paths que no tienen un match más
específico.

**Restricción de runtime**: el catch-all de Hono corre en el
**runtime de Node.js** (no el runtime default Edge). Los
binarios NAPI de `@node-rs/argon2` no se pueden cargar en el
runtime Edge; forzar `runtime = 'nodejs'` evita un error
de "module-not-found" en build time. La ruta de Auth.js
en `app/api/auth/[...nextauth]/route.ts` y el middleware de
Next.js en `middleware.ts` también corren en el runtime de
Node.js por la misma razón.

#### `GET /api/health`

Health check. Requerido por la skill de deployment.

- **Auth requerida**: no.
- **Request**: sin body.
- **Respuesta exitosa** (`200 OK`):

  ```ts
  interface HealthResponse {
    data: {
      status: 'ok';
      version: string; // de package.json
      uptime: number; // segundos desde el arranque del proceso
    };
  }
  ```

- **Efectos colaterales**: ninguno.
- **Respuestas de error**: no se esperan; ante un error
  lanzado, el handler central devuelve `500 INTERNAL_ERROR` y
  loguea el stack.

#### `GET /api/me`

Devuelve el usuario autenticado.

- **Auth requerida**: sí (cookie de sesión válida).
- **Request**: sin body. Lee la sesión vía `auth()` y
  devuelve la proyección pública.
- **Respuesta exitosa** (`200 OK`):

  ```ts
  interface MeSuccess {
    data: {
      id: string; // cuid
      email: string; // normalizado
      name: string | null;
      image: string | null;
      defaultProvider: 'local' | 'google';
      lastLoginAt: string | null; // ISO 8601
    };
  }
  ```

  La respuesta NUNCA incluye `passwordHash`, `emailVerified`
  ni material de tokens.

- **Efectos colaterales**: ninguno. Leer la sesión no
  extiende su expiry; la extensión de la sliding window de
  Auth.js se dispara en requests autenticados que pasan por
  `auth()`.
- **Respuestas de error**:

  | Status | Code           | Cuándo                                                                                                                     |
  | ------ | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
  | 401    | `UNAUTHORIZED` | La cookie de sesión falta, la fila de `Session` no existe, o la sesión expiró. La respuesta es idéntica en los tres casos. |

#### `POST /api/auth/register`

Crea un nuevo usuario local con email + password. **Este es
un endpoint de Hono, no un endpoint de Auth.js.** El
`authorize()` de Credentials de Auth.js solo autentica
usuarios existentes; el registro necesita un camino aparte.

- **Auth requerida**: no.
- **Body del request** (`application/json`):

  ```ts
  interface RegisterRequest {
    email: string; // RFC 5322; lowercase + trim server-side.
    password: string; // Plaintext solo sobre la wire; nunca se loguea.
  }
  ```

  Schema Zod (en `src/modules/auth/application/dto/register.dto.ts`):

  ```ts
  const registerSchema = z.object({
    email: z.string().email().max(254),
    password: z.string().min(10).max(128),
  });
  ```

- **Respuesta exitosa** (`201 Created`):

  ```ts
  interface RegisterSuccess {
    data: {
      id: string; // cuid
      email: string; // normalizado
      name: string | null;
      image: string | null;
      defaultProvider: 'local';
    };
  }
  ```

  El endpoint NO emite una sesión. El usuario debe iniciar
  sesión después vía el callback Credentials de Auth.js. Esto
  es intencional: un único camino (`authorize()`) es dueño de
  la creación de sesión.

- **Efectos colaterales**:
  - Inserta una fila de `User` con `passwordHash` (Argon2id),
    `defaultProvider = "local"`, `lastLoginAt = null`,
    `emailVerified = null`.
  - Emite un evento `UserRegistered` con
    `{ userId, email, provider: "local", occurredAt }` en el
    event dispatcher in-process (ver Contratos
    cross-module).
- **Respuestas de error**:

  | Status | Code               | Cuándo                                                                                                                                     |
  | ------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
  | 400    | `VALIDATION_ERROR` | El body falla la validación del schema Zod. El campo `details` de la respuesta de error lleva la lista de issues.                          |
  | 400    | `WEAK_PASSWORD`    | Largo de password < 10 (BR-AUTH-2). Devuelve la misma forma que `VALIDATION_ERROR` para uniformidad del cliente.                           |
  | 409    | `EMAIL_TAKEN`      | Ya existe un usuario con el mismo email normalizado. La forma y el timing de la respuesta son comparables al camino de éxito (BR-AUTH-7).  |
  | 429    | `RATE_LIMITED`     | Rate limit por IP o por cuenta alcanzado. El cambio `security-rate-limiting` es dueño del límite; la forma de la respuesta se define allí. |
  | 500    | `INTERNAL_ERROR`   | La librería Argon2 falló al cargar o cualquier fallo inesperado.                                                                           |

## Códigos de error

Lista exhaustiva de códigos de error que el módulo `auth`
puede devolver, agrupados por categoría. Todos los códigos
mapean a instancias de `AppError` (ver skill
`error-handling`). El mapping es normativo: un cambio futuro
puede agregar códigos nuevos, pero los existentes DEBEN
mantener su HTTP status y su valor de machine code.

### Errores emitidos por Auth.js (manejados por la página de error de Auth.js)

Los siguientes códigos los produce Auth.js mismo y se
exponen en la página de sign-in o en la URL de sign-in. El
código de aplicación no los lanza; reacciona a ellos cuando
Auth.js redirige de vuelta con `?error=<code>`.

| Code                    | Trigger                                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Configuration`         | La config de Auth.js es inválida (ej. falta `AUTH_SECRET`). Detectado en el arranque.                                                                    |
| `AccessDenied`          | El callback `signIn` devolvió `false` para un usuario que queremos bloquear explícitamente. Sin uso en MVP.                                              |
| `Verification`          | El token de verificación de email en el link es inválido o expiró. Sin uso en MVP.                                                                       |
| `OAuthSignin`           | Falló el inicio del flujo OAuth (ej. provider mal configurado).                                                                                          |
| `OAuthCallback`         | El request del callback OAuth vino malformado.                                                                                                           |
| `OAuthCreateAccount`    | Auth.js falló al crear la fila de `User` o `Account` desde una respuesta OAuth exitosa.                                                                  |
| `EmailCreateAccount`    | Igual que `OAuthCreateAccount` para el provider de email.                                                                                                |
| `Callback`              | Catch-all genérico para errores de callback.                                                                                                             |
| `OAuthAccountNotLinked` | La cuenta de Google ya está vinculada a un `User` diferente (BR-AUTH-10). La restricción unique sobre `Account(provider, providerAccountId)` lo captura. |
| `EmailSignin`           | Error del flujo de sign-in por "magic link". Sin uso en MVP.                                                                                             |
| `CredentialsSignin`     | El `authorize()` de Credentials devolvió `null`. Cubre email desconocido, password incorrecto y usuario solo-Google (BR-AUTH-4, BR-AUTH-9).              |
| `SessionRequired`       | El usuario pegó en una ruta protegida sin sesión. No lo lanza el módulo auth directamente; lo lanza el guard de la página/ruta.                          |

### Errores emitidos por la aplicación (endpoints Hono)

| Code                  | HTTP | Mensaje humano                                         | Cuándo                                                                                                                                                                 |
| --------------------- | ---- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VALIDATION_ERROR`    | 400  | "Los datos enviados no son válidos."                   | El body del request falla la validación Zod. El campo `details` lleva la lista de issues.                                                                              |
| `WEAK_PASSWORD`       | 400  | "La contraseña debe tener al menos 10 caracteres."     | Largo de password < 10 (BR-AUTH-2).                                                                                                                                    |
| `INVALID_CREDENTIALS` | 401  | "Credenciales inválidas."                              | El `authorize()` de Credentials devolvió `null` (el error `CredentialsSignin` de Auth.js se vuelve `INVALID_CREDENTIALS` del lado Hono cuando la UI muestra el fallo). |
| `UNAUTHORIZED`        | 401  | "Autenticación requerida."                             | `GET /api/me` sin sesión, cookie faltante, sesión expirada, o usuario desconocido. Forma idéntica en los cuatro modos de fallo.                                        |
| `EMAIL_TAKEN`         | 409  | "El email ya está registrado."                         | `POST /api/auth/register` con un email que ya existe (BR-AUTH-7).                                                                                                      |
| `RATE_LIMITED`        | 429  | "Demasiadas solicitudes. Probá de nuevo en un minuto." | Rate limit por IP o por cuenta alcanzado. El cambio `security-rate-limiting` es dueño del límite.                                                                      |
| `INTERNAL_ERROR`      | 500  | "Ocurrió un error inesperado."                         | Catch-all para fallos inesperados. El error real se loguea con stack completo; la respuesta lleva solo el code y el mensaje seguro.                                    |

## Reglas de negocio

Las reglas debajo son normativas. Cada regla tiene un ID
estable para trazabilidad entre spec, design, implementación
y tests.

- **BR-AUTH-1** — El email es el identificador canónico. No
  hay usernames. El email se normaliza (lowercase, trim)
  antes de almacenar y de buscar. La comparación es
  case-insensitive. La columna en Postgres es semántica
  `citext` por convención de aplicación; la capa de
  aplicación es el único lugar que ve el email crudo.
- **BR-AUTH-2** — Largo mínimo de la contraseña local: 10
  caracteres. Sin reglas de complejidad más allá del largo
  (NIST SP 800-63B). Se enforce en el schema Zod en la
  frontera de la acción `POST /api/auth/register`.
- **BR-AUTH-3** — Argon2id es la única primitiva aceptable
  de hashing de passwords en este cambio. Los parámetros
  finales (`memoryCost`, `timeCost`, `parallelism`) quedan
  registrados en el design y producen un target de hash time
  en el rango 50–100 ms en la VM 1-CPU de Fly.io. El gate de
  benchmark se describe en el design.
- **BR-AUTH-4** — La enumeración de usuarios se mitiga en la
  función `authorize()` de Credentials. Cuando el email no se
  encuentra, o el `User` existe pero no tiene `passwordHash`,
  la función hashea una password dummy fija con los mismos
  parámetros Argon2id antes de devolver `null`. El tiempo de
  respuesta para "email desconocido" y "password incorrecto"
  es estadísticamente indistinguible. El mismo timing se
  preserva cuando el usuario existe pero no tiene password
  local (BR-AUTH-9).
- **BR-AUTH-5** — Auto-link por match de email. Cuando
  Google devuelve un email que ya existe en `User`, el
  Prisma adapter (vía el callback `linkAccount` de Auth.js)
  crea una nueva fila de `Account` vinculada al `User`
  existente. No se pide password. La fila de `User` conserva
  sus datos existentes, incluido `defaultProvider`
  (BR-AUTH-13).
- **BR-AUTH-6** — Se confía en `email_verified: true` de
  Google. El provider Google de Auth.js enforce esto: si el
  claim es `false` o falta, el flujo OAuth falla y Auth.js
  devuelve un error. No hay camino de código en nuestra
  aplicación que evite este chequeo.
- **BR-AUTH-7** — La expiración de sesión es 30 días,
  sliding. La cookie `authjs.session-token` lleva un token
  opaco que se resuelve a una fila de `Session`. Aplican los
  defaults de Auth.js `session.maxAge = 30 * 24 * 60 * 60` y
  `session.updateAge = 24 * 60 * 60`. La columna `expires` de
  la fila de sesión se actualiza en cada request que
  encuentra una sesión válida, siempre que la sesión se haya
  usado dentro de las últimas 24 horas.
- **BR-AUTH-8** — Sign out revoca solo la sesión actual.
  Auth.js elimina la fila de `Session` cuyo `sessionToken`
  matchea la cookie y limpia la cookie. Los otros
  dispositivos siguen funcionando. "Cerrar sesión en todos
  lados" está fuera de alcance para MVP y es un cambio
  aparte.
- **BR-AUTH-9** — La búsqueda de Credentials requiere
  `passwordHash` seteado. Si el usuario fue creado vía Google
  y nunca seteó password, `passwordHash` es `null`. La
  función `authorize()` devuelve `null` (con igualación de
  timing por hash dummy, BR-AUTH-4). La UI muestra "esta
  cuenta usa Google" en la página de sign-in.
- **BR-AUTH-10** — Unicidad de vinculación de cuentas. La
  restricción `@@unique([provider, providerAccountId])` sobre
  `Account` evita que la misma cuenta de Google se vincule a
  dos `User` distintos. Si un actor malicioso intenta
  vincular su Google a un `User` víctima, el segundo link
  falla y Auth.js devuelve `OAuthAccountNotLinked`. El
  usuario debe iniciar sesión con el email que originalmente
  reclamó la cuenta de Google.
- **BR-AUTH-11** — No hay secretos, tokens ni material de
  password en los logs. Las passwords, los valores de
  `passwordHash`, los session tokens, los access/refresh/id
  tokens de Google y los tokens CSRF nunca se loguean. La
  capa de logging estructurado en `src/shared/logger` se
  configura con una denylist de
  `{ password, passwordHash, sessionToken, access_token,
refresh_token, id_token, csrfToken, "set-cookie" }`. Una
  regla de lint prohíbe `console.log` y `console.debug` en
  `src/modules/auth/**` y en `src/shared/env/**`.
- **BR-AUTH-12** — Los intentos de login fallidos no se
  rate-limitean en MVP. Documentado como riesgo aceptado. El
  cambio `security-rate-limiting` es dueño de los rate limits
  por IP y por cuenta sobre
  `/api/auth/callback/credentials`. Mitigación mientras
  tanto: BR-AUTH-4 iguala el timing, de modo que un atacante
  de fuerza bruta no puede distinguir "no existe usuario" de
  "existe, password incorrecto" por latencia.
- **BR-AUTH-13** — `defaultProvider` se setea en el primer
  registro y nunca se cambia. Para Credentials → `"local"`.
  Para Google → `"google"`. El campo lo lee `GET /api/me`
  para renderizar la pista "último método de inicio" en la
  UI. El callback `signIn` de Auth.js lo tilda solo en el
  primer registro.
- **BR-AUTH-14** — La normalización de email es irreversible.
  El email original (sin normalizar) nunca se almacena. El
  `email_verified` de Google se valida sobre la forma
  normalizada. Si un usuario cambia su email más adelante, un
  cambio aparte lo maneja.

## Garantías de seguridad

El módulo `auth` garantiza lo siguiente. Cualquier cosa que
rompa una de ellas es un breaking change y requiere un delta
de spec.

- **Almacenamiento de passwords** — Las passwords se
  almacenan solo como strings codificados en Argon2id, con
  parámetros afinados a ~50–100 ms en la VM 1-CPU de Fly.io
  (BR-AUTH-3). La password en plaintext nunca se persiste,
  loguea ni incluye en ningún body de respuesta. La elección
  de librería (`@node-rs/argon2` o fallback a `argon2`) queda
  registrada en el design con el resultado del benchmark.
- **Almacenamiento de sesiones** — Las sesiones viven en la
  tabla `Session` en Postgres. La aplicación NUNCA emite,
  verifica ni almacena sus propios JWTs. La cookie
  `authjs.session-token` lleva un session token opaco; el
  servidor lo resuelve contra la tabla `Session` en cada
  llamada a `auth()`. El token es HTTP-only, `Secure` en
  producción, y `SameSite=Lax`.
- **CSRF** — Auth.js maneja CSRF en sus propias rutas vía el
  patrón double-submit (`/api/auth/csrf` provee el token;
  todo POST lo requiere). Los endpoints de Hono que mutan
  estado (`POST /api/auth/register` en este cambio) DEBEN
  verificar el header `Origin` contra una allowlist de
  orígenes confiables, configurada desde `env.APP_URL`. Un
  `Origin` faltante o que no matchea se rechaza con
  `403 FORBIDDEN`.
- **Estado OAuth** — Auth.js maneja el parámetro `state` de
  OAuth. La protección CSRF está manejada por la librería; no
  la re-implementamos.
- **Seguridad del auto-link** — La restricción unique sobre
  `Account` para `(provider, providerAccountId)` (BR-AUTH-10)
  es la única línea de defensa contra un usuario malicioso
  que intente vincular su cuenta de Google a la fila de
  `User` de una víctima. La violación del unique se traduce
  al error `OAuthAccountNotLinked` de Auth.js. Es
  comportamiento estándar de la industria (Notion, Linear,
  Vercel). Un pase de hardening se trackea fuera de este
  cambio.
- **Confianza en `email_verified`** — El provider Google de
  Auth.js enforce `email_verified: true` (BR-AUTH-6). Los
  emails de Google no verificados fallan el flujo OAuth en
  la capa de librería; no agregamos un segundo chequeo.
- **Timing attacks en login** — La función `authorize()` de
  Credentials DEBE hashear una password dummy fija (con los
  mismos parámetros Argon2id) cuando el email no se
  encuentra o el usuario no tiene `passwordHash` (BR-AUTH-4,
  BR-AUTH-9). La forma y el timing de la respuesta son
  estadísticamente indistinguibles entre los tres modos de
  fallo (email desconocido, password incorrecto, usuario
  solo-Google).
- **Secretos en logs** — Las passwords, los valores de
  `passwordHash`, los session tokens, los access/refresh/id
  tokens de Google y los tokens CSRF nunca se loguean
  (BR-AUTH-11). La capa de logging estructurado se configura
  con una denylist y una regla de lint lo enforce.
- **Atributos de la cookie** — La cookie `authjs.session-token`
  la setea Auth.js con los siguientes atributos (comportamiento
  por defecto de Auth.js v5; no los overrideamos):
  - `HttpOnly` — nunca legible desde JavaScript.
  - `Secure` en producción, omitido en desarrollo local.
  - `SameSite=Lax` — protege contra la mayoría de CSRF en
    navegaciones top-level.
  - `Path=/` — se envía en cada request, incluido el Hono
    catch-all.

### Cobertura de tests de seguridad

Seis tests de seguridad viven en
`src/modules/auth/__tests__/security/`. Son los checks
end-to-end que cazan regresiones de las garantías de arriba.
El job `security` de CI corre los seis; dev local puede
opt-out del test de timing con `SKIP_TIMING=true`.

| #   | Archivo                     | Lo que asserta                                                                                                                                                                                                                                                                                        | Refina                          |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1   | `login.timing.test.ts`      | Welch's t-test sobre 30 paired samples (`known + wrong` vs `unknown + any`) retorna `p > 0.01`.                                                                                                                                                                                                       | BR-AUTH-4 (timing equalization) |
| 2   | `oauth.state-csrf.test.ts`  | Un parámetro `state` alterado o faltante en el callback OAuth se rechaza; no se crea fila `User` / `Account`.                                                                                                                                                                                         | BR-AUTH-6 (OAuth state)         |
| 3   | `secrets.in-logs.test.ts`   | La denylist del logger estructurado strips `password`, `passwordHash`, `sessionToken`, `access_token`, `refresh_token`, `id_token`, `csrfToken`, `set-cookie`, `authorization`, `cookie`, `code` (11 claves) de la salida capturada. También strips `Bearer <jwt>` de los valores de `Authorization`. | BR-AUTH-11 (secretos en logs)   |
| 4   | `origin-check.test.ts`      | `POST /api/auth/register` con `Origin` que no matchea `env.APP_URL` retorna `403 FORBIDDEN`.                                                                                                                                                                                                          | Sección CSRF de arriba          |
| 5   | `argon2.parameters.test.ts` | `hashArgon2id(password)` con los parámetros de producción (`memoryCost=19456, timeCost=2, parallelism=1`) corre en una banda de performance ajustada. Banda CI: `[10, 100] ms`; banda local: `[5, 200] ms`. La banda local más ancha absorbe la varianza de CPU del host.                             | BR-AUTH-3 (parámetros Argon2id) |
| 6   | `cookie.attributes.test.ts` | `authjs.session-token` tiene `HttpOnly`, `SameSite=Lax`, `Path=/`; `Secure` se setea en producción.                                                                                                                                                                                                   | Atributos de cookie de arriba   |

**Nota sobre el método de test**: los tests #2, #5 y #6 usan
`vi.mock` sobre el módulo `authjs` propio del proyecto +
static checks de texto de fuente en lugar de ejercitar el
flujo vivo de Auth.js. Esta es una reducción deliberada de
scope: el contrato (la config que Auth.js lee) se asserta,
pero la integración de runtime (mandar un callback real a
una instancia real de Auth.js) es propiedad de la suite de
tests propia de Auth.js. El job `security` de CI corre los
seis archivos.

## Contratos cross-module

Otros módulos confían en los siguientes invariantes. Cualquier
cambio que rompa uno de ellos es un breaking change y requiere
un delta de spec.

### Helper server-side `auth()`

Tanto los server components (páginas del App Router) como los
route handlers de Hono DEBEN usar el helper server-side
`auth()` exportado desde
`src/modules/auth/infrastructure/authjs.ts` (re-exportado por
`src/modules/auth/index.ts`). El helper es la función `auth()`
unificada de Auth.js v5.

```ts
// Firma — Auth.js v5.
const session = await auth();
// session es { user: PublicUser, expires: string } en sesión válida
// session es null sin sesión, con sesión expirada, o con usuario desconocido.
```

El `session.user.id` es la clave de autorización que usa cada
capability posterior. El helper es el ÚNICO modo de resolver
la identidad del llamador. Ningún módulo lee la cookie
directamente, ninguno lee la tabla `Session` directamente,
ninguno llama a `headers().get('cookie')` para parsear
material de sesión.

### `User` es la única fuente de verdad de identidad

Las tablas de otros módulos referencian `User.id` (cuid) vía
`userId`. La fila de `User` es el único ancla de identidad.

| Invariante                                                                           | Razón                                                                                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `userId` es el único identificador estable en el que otros módulos deberían confiar. | El email puede cambiar (el usuario actualiza su cuenta de Google), el nombre puede cambiar. `userId` es server-controlled e inmutable. |
| Cada `WHERE userId = ?` de otro módulo DEBE acotarse al llamador.                    | La capa de aplicación lo enforce; la base no tiene row-level security en MVP.                                                          |
| Los módulos NO DEBEN agregar su propia columna `email`.                              | El email pertenece a `User`. Un usuario puede cambiarlo; los módulos que necesiten el valor actual lo re-resuelven desde `User`.       |

### Evento `UserRegistered`

Despachado exactamente una vez por usuario, en el primer
registro (credentials o Google). El camino de auto-link
(BR-AUTH-5) **no** re-emite este evento. Se despacha vía el
event dispatcher in-process en `src/shared/events/`.

```ts
interface UserRegisteredEvent {
  type: 'UserRegistered';
  payload: {
    userId: string; // cuid
    email: string; // normalizado en lowercase.
    provider: 'local' | 'google';
    occurredAt: string; // ISO 8601.
  };
}
```

Los consumidores downstream (ej. un futuro worker de email
de bienvenida, el cambio `accounts-ledger` para sembrar
cuentas por defecto) se suscriben vía `src/shared/events/`.
El módulo `auth` nunca importa de otro módulo directamente
(skill `architecture-standards`). En este cambio no se
implementa ningún consumidor.

### Evento `UserSignedIn`

Despachado en cada sign-in exitoso, sin importar el
proveedor. Los consumidores downstream pueden suscribirse,
por ejemplo, a un timestamp de "última vez visto" en un
módulo de analytics.

```ts
interface UserSignedInEvent {
  type: 'UserSignedIn';
  payload: {
    userId: string; // cuid
    provider: 'local' | 'google';
    occurredAt: string; // ISO 8601.
  };
}
```

### Índice del módulo y API pública

`src/modules/auth/index.ts` exporta:

- `auth()` — el helper server-side de Auth.js v5.
- `signIn` y `signOut` — server actions exportadas por
  Auth.js, para usar en server components.
- `handlers` — los handlers `GET` y `POST` para
  `/api/auth/*`, re-exportados desde `auth.ts` y montados en
  `app/api/auth/[...nextauth]/route.ts`.
- La instancia `OpenAPIHono` de Hono para las rutas `/api/*`
  (no-auth), exportada para consumo tipado por la UI.
- Los nombres de eventos `UserRegistered` y `UserSignedIn`
  (para subscriptores type-safe).

Nada más en el codebase accede a los internos del módulo.

### Middleware del App Router

`middleware.ts` en la raíz del proyecto protege las páginas
futuras del App Router (por ej. `/dashboard`) haciendo un
302-redirect de las requests no autenticadas a
`/auth/signin`. El middleware es el camino **más rápido
para fallar** para páginas del App Router; la ruta Hono
`/api/me` ya retorna 401 cuando falta la sesión, y el
middleware Hono `origin-check` ya rechaza los POSTs
cross-origin.

El matcher del middleware es:

```ts
export const config = {
  matcher: ['/((?!_next|api/auth|favicon.ico).*)'],
  runtime: 'nodejs',
};
```

El matcher **sí** corre en paths `/api/*` (solo `/api/auth/*`
queda excluido). Para una request no autenticada a una ruta
de Hono como `/api/me`, el chequeo `isAuthed = !!request.auth`
del middleware retorna `false`, pero la allowlist
`PUBLIC_PATHS` (`['/auth/signin', '/auth/signout', '/']`) no
matchea `/api/*`. La resolución de `auth()` propia del route
handler de Hono corre después del middleware y retorna 401
antes de que cualquier redirect sea observado por el cliente.
El matcher es intencional: el middleware `origin-check` de
Hono y la resolución `auth()` de Hono son los caminos
**autoritativos** para las requests de API; el middleware
del App Router es solo para páginas.

Los paths públicos (signin, signout, root) están exentos
del redirect para que la propia página de signin sea
alcanzable cuando no hay autenticación.

El middleware corre en el **runtime de Node.js** (no el
runtime default Edge) por la misma razón NAPI de
`@node-rs/argon2` documentada en la sección del catch-all
de arriba.

### Configuración de tests

`vitest.config.ts` configura el test runner con dos
decisiones relevantes para producción:

- **`resolve.alias`** mapea `@` a `./src` para que los
  imports estilo `@/modules/auth` resuelvan en los tests.
- **`coverage.include`** restringe la cobertura v8 a
  `src/modules/auth/**`, `src/shared/db/**`,
  `src/shared/env/**`, `src/shared/logger/**`,
  `src/shared/http/**`, `src/shared/errors/**`,
  `src/shared/events/**`, `src/shared/crypto/**`. Los
  thresholds de cobertura son `lines: 80, branches: 80,
functions: 80, statements: 80` y fallan el job de test
  si no se cumplen.
- **`test.exclude`** es `['node_modules', 'dist', '.next']`.
  No se excluyen archivos de test de producción. El
  workaround previo de resolución de módulo (excluir 3
  archivos de test que importaban transitivamente
  `next/server` vía `next-auth@5.0.0-beta.25`) se cerró en
  el cambio `auth-foundation-slice-c` bumpeando `next-auth`
  a `5.0.0-beta.31` (que removió el import bare) y
  reescribiendo los 3 tests como static checks de texto de
  fuente (en `index.test.ts` y
  `app/api/auth/[...nextauth]/route.test.ts`) o como tests
  de contrato basados en `vi.mock` (en
  `infrastructure/external/authjs.test.ts`).
- **`test.setupFiles`** apunta a `./test/setup.ts`, que
  siembra `env.APP_URL`, `env.AUTH_SECRET` y otras env
  vars validadas por Zod para que el schema de env parsee
  en los tests.

### Integración continua

`.github/workflows/ci.yml` define cuatro jobs paralelos que
corren en `pull_request` a `develop` o `main` y en `push` a
`develop` o `main`. La concurrencia se cancela en vuelo
sobre el mismo ref.

| Job        | Verifica                                                                                                                                                          | Servicio Postgres                                          |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `lint`     | `pnpm install --frozen-lockfile`, `pnpm prisma generate`, `pnpm run lint`, `pnpm run typecheck`                                                                   | no                                                         |
| `test`     | `pnpm install --frozen-lockfile`, `pnpm prisma generate`, `pnpm prisma migrate deploy`, `SKIP_TIMING=true npx vitest run --coverage`, upload `coverage/` artifact | `services: postgres: image: postgres:16` (con healthcheck) |
| `build`    | `pnpm install --frozen-lockfile`, `pnpm prisma generate`, `pnpm run build`                                                                                        | no                                                         |
| `security` | `pnpm install --frozen-lockfile`, `pnpm prisma generate`, `pnpm test src/modules/auth/__tests__/security/`                                                        | no (los 6 tests de seguridad no necesitan DB real)         |

La branch protection sobre `develop` (documentada en
`docs/branch-protection.md`, aplicada manualmente por el
mantenedor) requiere que los 4 jobs estén verde antes de
mergear.

### Gobernanza del repositorio

- **`.github/CODEOWNERS`** lista a `@sebailla` como owner
  por defecto para todo archivo. Todo PR pide review del
  maintainer.
- **`docs/branch-protection.md`** documenta las reglas de
  branch protection aplicadas a `develop` (y luego a
  `main`): requerir 1 review, requerir CI verde en los 4
  jobs, descartar aprobaciones stale en push, requerir
  historia lineal (solo squash-merge), no force-pushes.
  La configuración real de GitHub la aplica manualmente el
  usuario (requiere permisos de repo-admin).
- **5 ADRs** en `docs/adr/` (Auth.js v5, Prisma 6,
  parámetros Argon2id, Hono catch-all, modelo de seguridad
  auto-link) siguen el template MADR. Cada ADR tiene una
  subsección `### Considered Options` con 3+ alternativas
  rechazadas.

## Fuera de alcance

- Otros proveedores OAuth (Apple, Facebook, GitHub). El
  schema de Prisma ya soporta N proveedores por usuario;
  solo Google se envía en MVP.
- Flujos de password reset y email verification. En MVP, el
  password reset es un UPDATE manual a SQL por el operador.
  Un cambio `email-verification` aparte usará la tabla
  `VerificationToken`.
- Autenticación multi-factor.
- Rate limiting sobre
  `/api/auth/callback/credentials`. El cambio
  `security-rate-limiting` es dueño de los rate limits por
  IP y por cuenta. Documentado como riesgo aceptado en
  BR-AUTH-12.
- Listado de sesiones y "cerrar sesión en todos los
  dispositivos". Sign out revoca solo la sesión actual
  (BR-AUTH-8). "Cerrar sesión en todos lados" es un cambio
  aparte.
- RBAC genérico por encima de `userId`. Cada cambio
  posterior maneja su propia disciplina de
  `WHERE userId = ?`.
- Pantallas de UI (form de sign-in, form de registro, botón
  de OAuth, pista "usá Google sign-in"). Del cambio
  `ui-auth-shell`. El contrato en este spec es la API HTTP
  únicamente.
- Vinculación de cuentas desde el perfil de usuario ("Link
  Google a mi cuenta"). El flujo de auto-link existe en el
  primer login OAuth (BR-AUTH-5); una UI manual de
  link/unlink es un cambio aparte.
- Eliminación de usuario y flujos GDPR. Del cambio
  `user-deletion`. El `onDelete: Cascade` del schema Prisma
  está listo para soportarlo.
- Poda de refresh tokens. Las sesiones se acumulan en la DB
  hasta que un cambio aparte las pode. Las sesiones son
  filas baratas; se difiere.
- Acciones de "Unlink Google" / "Set password" para
  usuarios existentes. Cambio aparte.
- JWTs emitidos por la app. La aplicación NUNCA emite,
  verifica ni almacena sus propios JWTs. Las sesiones están
  respaldadas en la base de datos.
- Refresh tokens emitidos por la app. La fila de `Session`
  es lo único que la app mintea, almacena y revoca. El
  "refresh" es el usuario reusando la cookie mientras siga
  válida; cuando expira, el usuario vuelve a iniciar sesión.
- Cambio de email. `User.email` es inmutable en MVP. Un
  cambio aparte es dueño del flujo.
- Emails de notificación por auto-link. Un futuro pase de
  hardening.

## Referencias

Artefactos de documentación que acompañan este spec pero no
son parte de su contenido normativo. Viven en:

- 5 ADRs (`docs/adr/0001..0005-*.md`) — las decisiones de
  arquitectura que produjeron este spec.
- Sección "Auth" de `docs/architecture.md` — el mapa del
  módulo de un vistazo (diagrama Mermaid, modelo de datos,
  rutas, estrategia de sesión, contratos cross-module).
  Mirror en español en `Documents-es/docs/architecture.md`.
- Sección "Local dev" de `README.md` — install, setup de
  base de datos, dev server, comandos de test, flag
  `SKIP_TIMING`. Mirror en español en
  `Documents-es/README.md`.
- `Documents-es/openspec/changes/auth-foundation/apply-progress.md`
  — el mirror en español del apply progress del change
  padre, mantenido en sync para cerrar el invariante de
  drift bilingüe (`AGENTS.md` §13.3).
