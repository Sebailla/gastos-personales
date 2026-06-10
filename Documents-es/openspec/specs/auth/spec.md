# Spec — capability `auth`

**Autor**: Sebastián Illa
**Capability**: `auth`
**Cambio origen**: `auth-foundation`
**Estado**: aprobada · **Creado**: 2026-06-09

## Propósito

La capability `auth` es la capa de identidad de `gastos-personales`.
Gestiona las cuentas de usuario, sus contraseñas locales, los links
con identidades de terceros (Google OAuth 2.0 en este cambio), los
tokens de access y refresh que prueban la identidad en llamadas
posteriores, y el middleware que cada otro módulo reutiliza para
extraer el `user_id` del llamador. Garantiza que: (a) un usuario
registrado puede autenticarse por cualquiera de los métodos de
credencial que haya registrado, (b) un llamador prueba su identidad
presentando un access JWT válido de vida corta, o canjeando en
silencio un refresh token todavía vigente, (c) las credenciales se
guardan usando primitivas estándar de industria (Argon2id para
passwords, sha256 para fingerprints de refresh tokens) y nunca
aparecen en logs, errores o response bodies, y (d) cualquier otro
módulo puede confiar en que `user_id` está presente y es confiable
en todo request que pase con éxito el `authMiddleware`.

## Entidades

### `User`

La identidad canónica del sistema. Un usuario tiene cero o una
password local y cero o más links a providers OAuth. Toda otra
entidad (Account, Transaction, Category, Snapshot, etc.) referencia
un `User` mediante `user_id`.

| Campo             | Tipo                | Restricciones                                                                              |
|-------------------|---------------------|--------------------------------------------------------------------------------------------|
| `id`              | `string` (uuid v7)  | Primary key. Generada server-side. Nunca se expone en el path de la API.                   |
| `email`           | `string`            | Único, lowercased, trimmed. Se trata como case-insensitive en la capa de storage (citext).|
| `password_hash`   | `string \| null`    | Forma encoded de Argon2id. `null` para usuarios Google-only. Nunca vuelve por la API.      |
| `email_verified`  | `boolean`           | `true` si lo confirmó auto-registro (BR-AUTH-08) o Google (`email_verified=true`).         |
| `default_provider`| `'local' \| 'google'`| Credencial usada en el primer registro. Se setea una vez, nunca se muta.                  |
| `created_at`      | `number` (unix sec) | Set en el insert.                                                                          |
| `updated_at`      | `number` (unix sec) | Actualizado en cada mutación.                                                              |

Invariantes:

- `id` es inmutable.
- `email` es inmutable en MVP. Un flow de cambio de email es un cambio separado.
- `password_hash` es `null` para usuarios registrados exclusivamente por Google.
- `default_provider` se setea en el primer registro exitoso y nunca
  se muta, incluso si después el usuario vincula un segundo provider.
- `email_verified` se setea en `true` al registrarse localmente
  (BR-AUTH-08 — no hay flow de verificación de email en MVP) y al
  valor del claim `email_verified` de Google en el registro OAuth.

Ciclo de vida:

- **Creado** en `POST /auth/register` o en el primer callback de
  Google OAuth exitoso para un email no visto previamente.
- **Leído** en `GET /auth/me`, y en cada request autenticado (para
  cargar el `User` referenciado por el `sub` del JWT).
- **No borrado** en este cambio. Un cambio futuro `user-deletion`
  maneja el cleanup estilo GDPR.

### `RefreshToken`

Una credencial de vida larga usada para obtener nuevos access tokens
sin pedirle al usuario que se re-autentique. El server guarda
solamente un fingerprint sha256; el token en plaintext se entrega al
cliente una sola vez.

| Campo         | Tipo                          | Restricciones                                                                            |
|---------------|-------------------------------|------------------------------------------------------------------------------------------|
| `id`          | `string` (uuid v7)            | Primary key.                                                                             |
| `user_id`     | `string` (uuid v7)            | Foreign key a `users.id`. Indexado.                                                      |
| `token_hash`  | `string` (hex sha256, 64 chars)| Fingerprint sha256 del token en plaintext. Único-indexado.                              |
| `family_id`   | `string` (uuid v7)            | Grupo de tokens emitidos por una cadena de rotaciones. Set en la primera emisión, copiado en cada rotación. |
| `issued_at`   | `number` (unix sec)           | Set en el insert.                                                                        |
| `expires_at`  | `number` (unix sec)           | `issued_at + REFRESH_TTL_SECONDS` (default 30 días).                                     |
| `revoked_at`  | `number \| null`              | `null` mientras esté activo. Set al unix time actual en la rotación, logout o revocación de familia. |
| `replaced_by` | `string \| null`              | `id` del nuevo refresh emitido en la rotación que revocó este.                            |

Invariantes:

- Un token está **activo** si y solo si
  `revoked_at IS NULL AND expires_at > now`.
- El token en plaintext nunca aparece en storage, logs, errores ni
  responses (salvo la respuesta de emisión one-time).
- Rotación: cada `POST /auth/refresh` emite una nueva fila con
  `family_id` igual al de la fila anterior, marca la fila anterior
  con `revoked_at = now` y `replaced_by = <new id>`, y devuelve el
  par nuevo de access + refresh.
- Reusar un token revocado revoca la **familia entera**
  (BR-AUTH-04).

Ciclo de vida:

- **Creado** en `POST /auth/register`, `POST /auth/login`,
  `POST /auth/refresh`, y en el path exitoso del callback de
  Google OAuth.
- **Leído** en `POST /auth/refresh` (lookup por `token_hash`).
- **Revocado** en `POST /auth/refresh` (token rotado), en
  `POST /auth/logout` (token actual), o ante reuso detectado de
  cualquier token previamente revocado de la misma familia
  (revocación en cascada).

### `OAuthAccount`

Un link entre un `User` y un provider de identidad externo. Este
cambio sale al mundo con `provider = 'google'`. El modelo de datos
soporta providers adicionales en cambios futuros.

| Campo              | Tipo                       | Restricciones                                              |
|--------------------|----------------------------|------------------------------------------------------------|
| `id`               | `string` (uuid v7)         | Primary key.                                               |
| `user_id`          | `string` (uuid v7)         | Foreign key a `users.id`. Indexado.                        |
| `provider`         | `'google'`                 | String tipo enum. Nuevos valores requieren un cambio de spec.|
| `provider_subject` | `string`                   | El id de sujeto estable y opaco del provider (claim `sub`).|
| `provider_email`   | `string`                   | El email que devolvió el provider al momento del link (auditoría).|
| `created_at`       | `number` (unix sec)        | Set en el insert.                                          |

Invariantes:

- Unique constraint en `(provider, provider_subject)` (BR-AUTH-12).
- `provider_email` es el valor **más recientemente observado**. El
  design especifica si se actualiza en logins subsecuentes; el spec
  registra la intención de audit-trail.
- Un usuario puede tener a lo sumo una fila por `provider` en MVP
  (no hay UX de "vincular dos veces al mismo provider"). El spec
  soporta múltiples filas por usuario siempre que `provider` difiera.

Ciclo de vida:

- **Creado** en el primer callback de Google OAuth exitoso para un
  `(provider, provider_subject)` dado. Como usuario nuevo (con un
  `users.id` recién creado) o vinculando a un usuario existente por
  match de email (BR-AUTH-09).
- **Leído** en el path del callback de OAuth para detectar "esta
  cuenta de Google ya está vinculada a un usuario".
- **No borrado ni actualizado** en este cambio. Los flows de unlink
  son un cambio separado.

## Endpoints

Todos los endpoints viven bajo el prefijo `/auth`. Todos los bodies
de request y response son JSON. Los endpoints
`/auth/oauth/google` y `/auth/oauth/google/callback` redirigen al
browser; los otros cinco devuelven JSON.

### `POST /auth/register`

Crea un nuevo usuario local con email + password.

**Autenticación requerida**: no.

**Request body** (`application/json`):

```ts
interface RegisterRequest {
  email: string;     // RFC 5322; lowercased + trimmed server-side.
  password: string;  // Plaintext solo en la red; nunca se loguea.
}
```

**Respuesta exitosa** (`201 Created`):

```ts
interface RegisterSuccess {
  data: {
    user: PublicUser;       // Sin password_hash ni campos internos.
    access_token: string;   // JWT, vida útil 15 minutos.
    refresh_token: string;  // Opaque base64url, vida útil 30 días. Single use.
    token_type: 'Bearer';
    expires_in: 900;        // Segundos hasta que expira el access_token.
  };
}

interface PublicUser {
  id: string;
  email: string;
  default_provider: 'local' | 'google';
  email_verified: boolean;
  created_at: number;
}
```

**Efectos colaterales**:

- Inserta una fila en `users` con `password_hash`,
  `email_verified = true`, `default_provider = 'local'`.
- Inserta una fila en `refresh_tokens` con un `family_id` nuevo y
  `revoked_at = NULL`.
- Emite el evento `UserRegistered` con
  `{ user_id, email, provider: 'local', occurred_at }` (ver
  Contratos cross-module).

**Respuestas de error**:

| Status | Código                | Cuándo                                                          |
|--------|-----------------------|-----------------------------------------------------------------|
| 400    | `INVALID_EMAIL`       | El email está vacío, mal formado, o falla la normalización server-side. |
| 400    | `PASSWORD_TOO_SHORT`  | Largo de password < 10.                                         |
| 400    | `VALIDATION_ERROR`    | El body falla la validación de schema por cualquier otro motivo.|
| 409    | `EMAIL_TAKEN`         | Ya existe un usuario con el mismo email normalizado. El tiempo de respuesta es comparable al path exitoso (BR-AUTH-07).|
| 500    | `INTERNAL_ERROR`      | La librería de Argon2 falló al cargar o cualquier falla inesperada.|

### `POST /auth/login`

Autentica a un usuario local existente con email + password.

**Autenticación requerida**: no.

**Request body**:

```ts
interface LoginRequest {
  email: string;
  password: string;
}
```

**Respuesta exitosa** (`200 OK`):

```ts
interface LoginSuccess {
  data: {
    user: PublicUser;
    access_token: string;
    refresh_token: string;
    token_type: 'Bearer';
    expires_in: 900;
  };
}
```

**Efectos colaterales**:

- Inserta una nueva fila en `refresh_tokens` con un `family_id`
  nuevo (BR-AUTH-04: la rotación arranca una cadena nueva; esta es
  la primera rotación).
- Actualiza `users.updated_at`.

**Respuestas de error**:

| Status | Código                | Cuándo                                                              |
|--------|-----------------------|---------------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`    | El body falla la validación de schema.                             |
| 401    | `INVALID_CREDENTIALS` | Email no encontrado, password que no matchea, o usuario Google-only. La forma de la respuesta y el timing son idénticos en los tres casos (BR-AUTH-07). |
| 500    | `INTERNAL_ERROR`      | La verificación con Argon2 falló de forma inesperada.              |

### `GET /auth/oauth/google`

Arranca el flow de Google OAuth 2.0.

**Autenticación requerida**: no.

**Request**: sin body. El server genera un token `state` random de
32 bytes, lo firma y lo guarda en una cookie HttpOnly, `Secure`,
`SameSite=Lax` scoped al path del callback de OAuth. Después hace
`302` redirect del browser a
`https://accounts.google.com/o/oauth2/v2/auth` con `client_id`,
`redirect_uri`, `response_type=code`, `scope=openid email profile`
configurados, y el parámetro `state`.

**Respuesta exitosa**: `302 Found` con `Location` apuntando a la
URL de authorize de Google.

**Respuestas de error**:

| Status | Código                   | Cuándo                                              |
|--------|--------------------------|-----------------------------------------------------|
| 500    | `INTERNAL_ERROR`         | Falló la generación de `state` o la firma de cookie.|
| 500    | `OAUTH_CONFIG_MISSING`   | Faltan `GOOGLE_CLIENT_ID` o `GOOGLE_REDIRECT_URI`.  |

### `GET /auth/oauth/google/callback`

Completa el flow de Google OAuth 2.0.

**Autenticación requerida**: no (la cookie `state` es la credencial).

**Query parameters** (validados server-side, ver BR-AUTH-11):

```ts
interface OAuthCallbackQuery {
  code: string;         // Authorization code de un solo uso.
  state: string;        // Debe matchear la cookie `state` firmada.
  // `error`, `error_description`: opcionales; si están, se tratan como falla.
}
```

**Respuesta exitosa**: `302 Found` con `Location` apuntando a
`${APP_URL}/auth/success#access_token=<jwt>&refresh_token=<token>`
(la landing page de éxito se implementa en `ui-auth-shell`; el
`#fragment` mantiene los tokens fuera de logs del server y headers
referrer). En el server, el path exitoso:

1. Valida `state` contra la cookie firmada. Mismatch → `302` a
   `${APP_URL}/login?error=oauth_state_mismatch`.
2. Canjea el `code` por tokens en el endpoint de tokens de Google.
3. Llama al endpoint `userinfo` de Google con el access token.
4. Rechaza el registro si `email_verified` es `false` (→ `302` a
   `${APP_URL}/login?error=oauth_email_unverified`).
5. Busca el usuario por email normalizado. Si lo encuentra, vincula
   una nueva fila de `oauth_accounts` a ese usuario (BR-AUTH-09). Si
   no, crea una nueva fila en `users` con `password_hash = null`,
   `default_provider = 'google'`, `email_verified = true`, y después
   inserta la fila en `oauth_accounts`.
6. Si el unique constraint `(provider, provider_subject)` entra en
   conflicto, rechaza con `302` a
   `${APP_URL}/login?error=oauth_subject_taken` (BR-AUTH-12).
7. Emite un par nuevo de access + refresh y redirige como arriba.

**Efectos colaterales**:

- Puede insertar una nueva fila en `users` (primera vez que se ve el email).
- Inserta una nueva fila en `oauth_accounts`.
- Inserta una nueva fila en `refresh_tokens` con un `family_id` nuevo.
- Emite el evento `UserRegistered` **solo en el primer registro**
  (es decir, cuando se crea una nueva fila en `users`). El path de
  auto-link **no** re-emite `UserRegistered`.

**Respuestas de error** (todas redirigen a
`${APP_URL}/login?error=<code>`, sin body JSON):

| Código                       | Cuándo                                                                                       |
|------------------------------|----------------------------------------------------------------------------------------------|
| `oauth_state_mismatch`       | La cookie `state` falta, el `state` del query no matchea, la cookie tiene más de 10 minutos, o falla la firma. |
| `oauth_code_expired`         | El endpoint de tokens de Google reporta que el authorization code es inválido o expiró.      |
| `oauth_token_revoked`        | Google reporta que el token fue revocado.                                                    |
| `oauth_email_unverified`     | `email_verified: false` en la respuesta de userinfo.                                         |
| `oauth_email_missing`        | Sin claim `email` en la respuesta de userinfo.                                               |
| `oauth_subject_taken`        | El par `(provider, provider_subject)` ya está vinculado a un usuario distinto.               |
| `oauth_provider_unavailable` | Error de red o 5xx desde Google. El server responde `502` con `Retry-After` antes de redirigir (de modo que el redirect es `302` después de que el 502 queda logueado). |
| `oauth_userinfo_failed`      | Google devolvió una respuesta non-2xx que no matchea ninguna de las categorías anteriores.   |

### `POST /auth/refresh`

Canjea un refresh token todavía vigente por un nuevo par de
access + refresh.

**Autenticación requerida**: no (el refresh token **es** la credencial).

**Request body**:

```ts
interface RefreshRequest {
  refresh_token: string;  // Plaintext, single-use.
}
```

**Respuesta exitosa** (`200 OK`):

```ts
interface RefreshSuccess {
  data: {
    access_token: string;
    refresh_token: string;  // Nuevo; el viejo queda revocado.
    token_type: 'Bearer';
    expires_in: 900;
  };
}
```

**Efectos colaterales**:

- Marca el refresh token presentado con
  `revoked_at = now`, `replaced_by = <new id>`.
- Inserta la nueva fila de refresh con el mismo `family_id` y
  `revoked_at = NULL`.

**Respuestas de error**:

| Status | Código              | Cuándo                                                                              |
|--------|---------------------|-------------------------------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`  | El body falla la validación de schema.                                              |
| 401    | `INVALID_TOKEN`     | El token presentado está malformado o su sha256 no se encuentra en `refresh_tokens`.|
| 401    | `REFRESH_EXPIRED`   | El `expires_at` del token está en el pasado.                                        |
| 401    | `REFRESH_REVOKED`   | El token ya está revocado. **Todos los tokens del mismo `family_id` se revocan como efecto colateral** (BR-AUTH-04). |

### `POST /auth/logout`

Revoca el refresh token actual.

**Autenticación requerida**: sí (se requiere un refresh token para
identificar la cadena a revocar).

**Request body**:

```ts
interface LogoutRequest {
  refresh_token: string;
}
```

**Respuesta exitosa** (`204 No Content`). El body está vacío por
diseño; no se devuelve un envelope `data`.

**Efectos colaterales**:

- Marca el refresh token presentado con `revoked_at = now` y limpia
  `replaced_by`.
- **No** cascada a otros tokens de la familia. El usuario legítimo
  que hace logout explícito solo revoca la cadena actual.

**Respuestas de error**:

| Status | Código              | Cuándo                                                                              |
|--------|---------------------|-------------------------------------------------------------------------------------|
| 400    | `VALIDATION_ERROR`  | El body falla la validación de schema.                                              |
| 401    | `INVALID_TOKEN`     | El token está malformado o no se encuentra. Hacer logout con un token desconocido es un no-op (idempotente). |

### `GET /auth/me`

Devuelve el usuario autenticado. Lo usa la UI para arrancar el
estado de sesión.

**Autenticación requerida**: sí (access JWT válido en
`Authorization: Bearer <token>`).

**Request**: sin body.

**Respuesta exitosa** (`200 OK`):

```ts
interface MeSuccess {
  data: PublicUser;
}
```

**Respuestas de error**:

| Status | Código         | Cuándo                                                                             |
|--------|----------------|------------------------------------------------------------------------------------|
| 401    | `UNAUTHORIZED` | Falta el header `Authorization`, el JWT está malformado, expiró, está firmado con el secret equivocado, o el `sub` no corresponde a un usuario existente. |

## Códigos de error

Lista exhaustiva de códigos de error que el módulo `auth` puede
devolver, agrupados por categoría. Todos los códigos se mapean a
instancias de `AppError` (ver skill `error-handling`). El mapeo es
normativo: un cambio futuro puede agregar códigos nuevos, pero los
existentes deben conservar su HTTP status y el valor de su código de
máquina.

### Validación (4xx, culpa del cliente)

| Código                  | HTTP | Mensaje humano (espejo inglés)                              | Cuándo |
|-------------------------|------|------------------------------------------------------------|--------|
| `VALIDATION_ERROR`      | 400  | "The submitted data is not valid."                         | El body del request falla la validación de schema Zod. El campo `details` del `AppError` carga la lista de issues. |
| `INVALID_EMAIL`         | 400  | "The email is not valid."                                  | Email vacío, mal formado, o que falla la normalización server-side. |
| `PASSWORD_TOO_SHORT`    | 400  | "The password must be at least 10 characters."             | Largo de password < 10. |
| `INVALID_TOKEN`         | 401  | "The token is invalid."                                    | Un token presentado está malformado, no se puede parsear, o su fingerprint no está en storage. |
| `UNAUTHORIZED`          | 401  | "Authentication required."                                 | Falta el access JWT, expiró, o es inválido para endpoints protegidos por `authMiddleware`. |

### Credenciales (4xx, culpa del cliente, sin info leak)

| Código                  | HTTP | Mensaje humano (espejo inglés)                              | Cuándo |
|-------------------------|------|------------------------------------------------------------|--------|
| `INVALID_CREDENTIALS`   | 401  | "Invalid credentials."                                     | Login: email no encontrado, password que no matchea, o usuario sin password local. Forma de respuesta y timing idénticos (BR-AUTH-07). |

### Conflicto (4xx, culpa del cliente)

| Código                  | HTTP | Mensaje humano (espejo inglés)                              | Cuándo |
|-------------------------|------|------------------------------------------------------------|--------|
| `EMAIL_TAKEN`           | 409  | "The email is already registered."                         | Register: ya existe un usuario con el mismo email normalizado. El tiempo de respuesta matchea el path exitoso (BR-AUTH-07). |
| `OAUTH_SUBJECT_TAKEN`   | 409  | "This Google account is already linked to another user."   | El unique constraint `(provider, provider_subject)` choca con una fila existente que apunta a un usuario distinto. |

### Refresh (4xx, culpa del cliente)

| Código                  | HTTP | Mensaje humano (espejo inglés)                              | Cuándo |
|-------------------------|------|------------------------------------------------------------|--------|
| `REFRESH_EXPIRED`       | 401  | "The session has expired. Please log in again."            | El `expires_at` del refresh token está en el pasado. |
| `REFRESH_REVOKED`       | 401  | "The session was revoked for security. Please log in again."| El refresh token ya está revocado. Dispara la revocación de familia (BR-AUTH-04). |

### OAuth (redirigidos)

Las fallas del callback de OAuth se devuelven como `302` redirects a
`${APP_URL}/login?error=<code>`. Los códigos también se reportan en
los logs del server con el mismo machine code.

| Código                          | Cuándo |
|---------------------------------|--------|
| `oauth_state_mismatch`          | Falta la cookie `state`, el `state` del query no matchea, la cookie tiene más de 10 minutos, o falla la firma. |
| `oauth_code_expired`            | El endpoint de tokens de Google reporta que el authorization code es inválido o expiró. |
| `oauth_token_revoked`           | Google reporta que el token fue revocado. |
| `oauth_email_unverified`        | `email_verified: false` en la respuesta de userinfo. |
| `oauth_email_missing`           | Sin claim `email` en la respuesta de userinfo. |
| `oauth_subject_taken`           | `(provider, provider_subject)` ya está vinculado a un usuario distinto. |
| `oauth_provider_unavailable`    | Error de red o 5xx desde Google. |
| `oauth_userinfo_failed`         | Google devolvió una respuesta non-2xx que no matchea ninguna de las categorías anteriores. |

### Server (5xx)

| Código                       | HTTP | Mensaje humano (espejo inglés)                              | Cuándo |
|------------------------------|------|------------------------------------------------------------|--------|
| `INTERNAL_ERROR`             | 500  | "An unexpected error occurred."                            | Catch-all para fallas inesperadas. El error real se loguea con stack completo. |
| `OAUTH_CONFIG_MISSING`       | 500  | "OAuth configuration is incomplete."                        | Faltan `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` o `GOOGLE_REDIRECT_URI`. |
| `OAUTH_PROVIDER_UNAVAILABLE` | 502  | "Identity provider is unavailable. Please retry."           | Error de red o 5xx desde Google en la llamada a token o userinfo. Se setea el header `Retry-After`. |

## Reglas de negocio

Las reglas de abajo son normativas. Cada regla tiene un ID estable
para trazabilidad entre spec, design, implementación y tests.

- **BR-AUTH-01** — El email es el identificador canónico. No hay
  usernames. El email se normaliza (lowercased, trimmed) antes de
  guardarse y consultarse. La comparación es case-insensitive.
- **BR-AUTH-02** — Largo mínimo de password local: 10 caracteres.
  Sin reglas de complejidad más allá del largo (NIST SP 800-63B).
- **BR-AUTH-03** — Argon2id es la única primitiva aceptable de
  hashing de passwords en este cambio. Los parámetros finales
  (memory, iterations, parallelism) se registran en el design y
  producen un tiempo de hash objetivo en el rango 50–100 ms en la VM
  1-CPU de Fly.io.
- **BR-AUTH-04** — La rotación de refresh tokens es obligatoria.
  Cada `POST /auth/refresh` exitoso emite un refresh nuevo y revoca
  el viejo. Reusar un refresh revocado se trata como robo: todos los
  tokens del mismo `family_id` se revocan y el usuario se ve forzado
  a re-autenticarse.
- **BR-AUTH-05** — Los access tokens no son revocables en MVP. Su
  vida útil de 15 minutos es el techo. Si alguna vez se necesita
  revocación de emergencia, se agrega una columna
  `users.token_version` en un cambio separado y se la consulta al
  verificar el JWT.
- **BR-AUTH-06** — Las passwords, los password hashes, los refresh
  tokens y los hashes de refresh tokens nunca aparecen en logs,
  respuestas de error ni response bodies. La capa de data-access
  strippea esos campos; la capa de logging los excluye por key.
- **BR-AUTH-07** — Se mitiga la enumeración de usuarios.
  `POST /auth/register` devuelve la misma forma de respuesta exista
  o no el email (`EMAIL_TAKEN` genérico para el conflicto y `201`
  exitoso para registros nuevos, con tiempo de procesamiento
  server-side comparable). `POST /auth/login` devuelve la misma
  forma de `INVALID_CREDENTIALS` y un tiempo de respuesta similar
  para los tres modos de falla (email no encontrado, password
  incorrecta, usuario Google-only).
- **BR-AUTH-08** — Los registros locales marcan
  `email_verified = true` al momento del insert. No hay flow de
  verificación de email en MVP. El email se confía por decreto; el
  rate limiting sobre `/auth/register` es un cambio separado.
- **BR-AUTH-09** — Cuando el callback de Google OAuth devuelve un
  email que ya existe en `users` (bajo cualquier provider), la
  nueva fila de `oauth_accounts` se vincula al `users.id` existente.
  No se pide password. La fila de `users` conserva su
  `default_provider` y su `email_verified` actuales. La fila de
  `oauth_accounts` es lo único que se crea.
- **BR-AUTH-10** — `default_provider` se setea en el primer registro
  y nunca cambia. El primer `POST /auth/register` exitoso escribe
  `'local'`; el primer callback de Google OAuth exitoso que crea
  una nueva fila en `users` escribe `'google'`. Los links
  posteriores a un provider dejan `default_provider` intacto.
- **BR-AUTH-11** — La cookie `state` de OAuth y el query param
  `code` son los únicos inputs que el server acepta del redirect de
  Google. El `APP_URL` y el `GOOGLE_REDIRECT_URI` configurados se
  validan entre sí al arranque; un mismatch falla rápido.
- **BR-AUTH-12** — A lo sumo existe una fila de `oauth_accounts` por
  par `(provider, provider_subject)`. El unique constraint impide
  que la misma cuenta de Google se vincule a dos filas de `users`
  distintas. El caso de violación de unique se reporta al usuario
  legítimo como `oauth_subject_taken` y no se re-aprovecha como un
  500 genérico.

## Garantías de seguridad

- **Storage de passwords** — Las passwords se guardan únicamente como
  strings encoded de Argon2id, con parámetros calibrados a
  ~50–100 ms en la VM 1-CPU de Fly.io. La password en plaintext
  nunca se persiste, se loguea, ni se incluye en ningún response body.
- **Storage de refresh tokens** — Los refresh tokens se guardan
  únicamente como fingerprints sha256. El token en plaintext sale
  del server una sola vez (en el campo `refresh_token` de la
  respuesta exitosa de `register`, `login`, `refresh`, y del
  fragment del redirect del callback de OAuth) y no se hace eco de
  él en ninguna llamada subsiguiente.
- **Verificación de JWT** — El middleware de auth verifica los JWTs
  con la env var `JWT_SECRET` usando comparación constant-time. El
  ataque `alg: none` se rechaza pineando el algoritmo a `HS256`
  tanto al emitir como al verificar.
- **Mitigación de timing-attack** — `POST /auth/login` corre
  siempre una verificación de Argon2id contra un hash dummy fijo
  cuando el email no se encuentra, de modo que el tiempo de
  respuesta no revela si el email existe. La forma de la respuesta
  es idéntica en los tres modos de falla (BR-AUTH-07).
- **Enumeración de usuarios** — `POST /auth/register` devuelve la
  misma forma de respuesta y un timing similar para `EMAIL_TAKEN` y
  éxito (BR-AUTH-07). Login usa `INVALID_CREDENTIALS` para los tres
  modos de falla.
- **CSRF en OAuth** — La cookie `state` se firma con `COOKIE_SECRET`
  (HMAC-SHA256) y se ata al path del callback de OAuth. El valor
  `state` del callback query se verifica contra la cookie antes de
  hacer cualquier otro trabajo. Una cookie faltante, mismatch,
  mayor a 10 minutos, o sin firma se rechaza como
  `oauth_state_mismatch`.
- **Rotación de refresh token ante reuso** — Cuando se presenta un
  refresh token revocado, la `family_id` entera se revoca en una
  sola transacción. La próxima llamada legítima a
  `POST /auth/refresh` desde cualquier dispositivo que compartía esa
  familia devuelve `REFRESH_REVOKED`, forzando al usuario a
  re-loguearse.
- **Aplicación de `email_verified` de OAuth** — El server lee
  `email_verified` de la respuesta de userinfo de Google y rechaza
  el registro con `oauth_email_unverified` cuando es `false` o
  falta. No hay path de código que bypasee este check.
- **Unicidad de subject OAuth** — El unique constraint de DB sobre
  `oauth_accounts(provider, provider_subject)` es la única línea de
  defensa contra un usuario malicioso que intenta vincular su cuenta
  de Google a la fila `users` de una víctima. La violación de
  unique se reporta como `oauth_subject_taken` y se surface al
  usuario sin exponer qué usuario ya es dueño del link.

## Contratos cross-module

Los otros módulos confían en los siguientes invariantes. Cualquier
cambio que rompa uno de ellos es un breaking change y requiere un
delta de spec.

### Evento `UserRegistered`

Se dispatcha exactamente una vez por usuario, en el primer registro
(local o Google). El path de auto-link **no** re-emite este evento.

```ts
interface UserRegisteredEvent {
  type: 'UserRegistered';
  payload: {
    user_id: string;            // uuid v7
    email: string;              // Normalizado lowercase.
    provider: 'local' | 'google';
    occurred_at: number;        // unix sec.
  };
}
```

Los consumidores downstream (ej. un futuro worker de email de
bienvenida) se suscriben vía `core/events/`. El módulo `auth` nunca
importa de otro módulo directamente (skill `architecture-standards`).

### Presencia de `user_id`

Todo request HTTP que pase con éxito el `authMiddleware` (es decir,
que devuelva 2xx o 4xx desde una ruta protegida) tiene
`req.context.user_id` seteado a un string uuid v7. El middleware
arroja `AppError(401, 'UNAUTHORIZED', ...)` ante cualquiera de:

- Falta el header `Authorization: Bearer`.
- Header malformado (no es un par `<scheme> <token>` separado por
  un solo espacio).
- Falla la verificación de firma del JWT.
- Expiración del JWT (`exp` en el pasado).
- El `sub` del JWT no corresponde a un `users.id` existente.

Las rutas declaran su requerimiento de auth con un wrapper
`requireAuth` (ver design para el contrato). El wrapper es puramente
sintáctico: el contrato subyacente es "o el `authMiddleware` corrió
con éxito, o la ruta no se ejecutó".

### Contrato del middleware

```ts
// Pseudocódigo — ver design para la forma de producción.
function authMiddleware(req: Request, ctx: Context): { user: User };
// throws AppError(401, 'UNAUTHORIZED', ...) ante cualquier falla
```

El middleware devuelve un `User` (la proyección pública, sin
`password_hash`) en el path exitoso. Las actions de la capa de
application destructuran `user.id` y lo pasan hacia abajo. El
middleware no enforce permisos más allá de "es un llamador válido"
— RBAC es post-MVP.

## Fuera de alcance

- Otros providers OAuth (Apple, Facebook, GitHub). El modelo de
  datos los soporta; el spec no.
- Flows de password reset y verificación de email. Para MVP, el
  password reset es un `UPDATE` manual de SQL por parte del
  operador.
- Multi-factor authentication.
- Rate limiting sobre `/auth/login`, `/auth/register` y
  `/auth/oauth/google`. Se trackea en el cambio separado
  `security-rate-limiting`.
- Listado de sesiones y "cerrar sesión en todos los dispositivos".
  El logout revoca solo la cadena actual (el cascade de BR-AUTH-04 es
  una defensa, no una feature).
- RBAC genérico por encima de `user_id`. Cada cambio posterior
  maneja su propia disciplina de `WHERE user_id = ?`.
- Pantallas de UI (form de login, form de registro, botón OAuth). El
  contrato de este spec es la API HTTP; la UI sale en
  `ui-auth-shell`.
- Vinculación de cuenta desde el perfil de usuario ("Vincular Google
  a mi cuenta" desde settings). El flow existe para el primer login
  OAuth; el link on-demand es un cambio separado.
- Acciones "Desvincular Google" / "Setear password" para usuarios
  existentes. Cambio separado.
- Pruning de refresh tokens. Los tokens revocados se acumulan en la
  DB hasta que un cambio futuro los pode.
- Borrado de usuarios. Un futuro cambio `user-deletion` maneja el
  cleanup estilo GDPR.
- Flow de cambio de email. `users.email` es inmutable en MVP.
- Notificaciones por email en auto-link. Pasada de hardening
  futura.
