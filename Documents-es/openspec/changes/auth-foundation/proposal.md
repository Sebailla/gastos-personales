# Propuesta — `auth-foundation`

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-09 · **Actualizado**: 2026-06-09 (OAuth de Google agregado)
**Slice objetivo**: MVP-1 (capa de identidad)
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)

## Por qué

`gastos-personales` es una app de finanzas multi-usuario. Cada entidad
(Account, Transaction, Snapshot, Category) pertenece a un `user_id`.
Cada endpoint de API necesita identificar al llamador. La capa de
auth es la única dependencia sobre la que se apoya toda capability
(accounts, transactions, fx, snapshots, reports, ui). Hacerla primero
permite que cada cambio posterior asuma que la identidad está resuelta.

Enviar auth como un cambio separado y aislado también reduce el
presupuesto de review de cada cambio posterior (no hay que re-validar
identidad en cada PR) y aísla el código más sensible (passwords, JWT,
refresh rotation, OAuth) para que reciba review adversarial dedicado.

## Qué

Un subsistema de auth autocontenido que soporta dos métodos de registro
y un mecanismo de login por usuario:

| Método | Registro | Login | Notas |
|---|---|---|---|
| Local (email + password) | `POST /auth/register` | `POST /auth/login` | Argon2id para hashing. |
| Google OAuth 2.0 | `GET /auth/oauth/google` → `GET /auth/oauth/google/callback` | Mismo callback (entrada unificada) | Provider opaco, único provider en este cambio. |

Los dos métodos se unifican en la entidad User: un usuario tiene cero
o una password local y cero o más providers OAuth. Un usuario puede
loguearse por cualquier método que tenga credencial registrada.

### Endpoints

| Endpoint | Comportamiento |
|---|---|
| `POST /auth/register` | Crea un usuario nuevo con email + password (local). Devuelve access + refresh tokens. |
| `POST /auth/login` | Verifica la password de un usuario local existente. Devuelve access + refresh tokens. |
| `GET /auth/oauth/google` | Redirige el browser a la pantalla de consentimiento de Google. Cookie `state` con token CSRF. |
| `GET /auth/oauth/google/callback` | Maneja el callback OAuth. Intercambia code, trae perfil, upsert user, emite nuestros tokens. Redirige a la app con tokens (o a `/login?error=…`). |
| `POST /auth/refresh` | Canjea un refresh token válido por un nuevo par access + refresh. El refresh viejo se rota. |
| `POST /auth/logout` | Revoca el refresh token actual. |
| `GET /auth/me` | Devuelve el usuario autenticado (lo usa la UI para arrancar la sesión). |

### Modelo de datos

- Tabla `users`: `id` (uuid v7), `email` (único, citext, normalizado lowercase), `password_hash` (Argon2id, **nullable**), `email_verified` (booleano, true si lo confirmó auto-registro o Google), `default_provider` (`local` | `google`), `created_at`, `updated_at`.
- Tabla `refresh_tokens`: `id` (uuid v7), `user_id`, `token_hash` (sha256 del token opaco), `issued_at`, `expires_at`, `revoked_at`.
- Tabla `oauth_accounts`: `id` (uuid v7), `user_id`, `provider` (`google` por ahora), `provider_subject` (el `sub` de Google), `provider_email` (el email que devolvió Google, para auditoría), `created_at`. Unique constraint en `(provider, provider_subject)`.

### Estrategia de tokens

- **Access token**: JWT HS256, vida útil 15 minutos. Claims: `sub` (user id), `iat`, `exp`, `jti`.
- **Refresh token**: opaco, 32 bytes random, base64url. Se guarda como sha256, nunca plaintext. Vida útil 30 días. Rotación: cada refresh emite un par nuevo y revoca el anterior. Reusar un refresh revocado revoca la familia entera.
- **Middleware de auth**: extrae el Bearer token, verifica el JWT, carga `user_id` en el contexto del request. Devuelve 401 si falta/expiró/es inválido.

### Detalles del flujo OAuth

- **Librería**: `arctic` (el sucesor moderno de `oslo` para providers OAuth en TS/Bun). O `google-auth-library` si queremos el SDK first-party de Google. Decisión en design.
- **Scopes**: `openid email profile`. El scope `openid` es lo que nos da el `id_token` y el claim `sub`. `email` nos da el email. `profile` no es estrictamente necesario para nuestro caso.
- **State**: 32 bytes random guardados en una cookie HttpOnly, SameSite=Lax, validados en el callback. Previene CSRF.
- **Fetch del perfil**: usamos el access token que devuelve Google para llamar a `https://openidconnect.googleapis.com/v1/userinfo`. Confiamos en `email_verified: true`; si es false, rechazamos el registro.
- **Auto-link por match de email**: si ya existe un usuario con el mismo email (local u otro provider), vinculamos la nueva cuenta OAuth a ese usuario. No le pedimos password. (Ver nota de seguridad abajo.)
- **UX de error**: ante cualquier falla en el flujo OAuth, redirigimos a `${APP_URL}/login?error=<code>` en vez de renderizar una página de error del server. La UI muestra el error.

## Fuera de alcance (este cambio)

- Otros providers OAuth (Apple, Facebook, GitHub) — post-MVP. El diseño los soporta, pero solo Google sale al mundo.
- Reset de password / verificación de email — post-MVP. Para MVP, el reset es UPDATE manual de SQL.
- Multi-factor auth — post-MVP.
- Rate limiting en `/auth/login` y `/auth/oauth/google` — cambio separado `security-rate-limiting`.
- Listado de sesiones / "cerrar sesión en todos los dispositivos" — cambio separado.
- Motor de permisos estilo RLS sobre `user_id` — cada cambio posterior maneja su `WHERE user_id = ?` discipline.
- Pantallas de UI (form de login, form de registro, botón OAuth) — cambio separado `ui-auth-shell`. El contrato acá es solo la API HTTP.
- "Vincular Google a mi cuenta" desde el perfil — cambio separado. El flow existe solo en el primer login OAuth.
- "Desvincular Google" / "Setear password" para usuarios existentes — cambios separados.

## No-objetivos

- **No estamos construyendo un auth-as-a-service.** Sin panel admin multi-tenant, sin provisioning de tenants, sin SSO.
- **No introducimos storage global de sesiones.** Los access tokens son JWTs stateless; los refresh tokens viven en DB pero solo se consultan al refrescar.
- **No manejamos workflows de GDPR / borrado de datos.** Los usuarios se borran junto con sus datos en una sola operación cuando llegue `user-deletion`.
- **No agregamos verificación de email para signups con Google.** Confiamos en el `email_verified` de Google. Un usuario con Google account de email no verificado nuestro registro lo rechaza, pero no corremos check propio.
- **No enviamos emails de notificación** cuando se auto-linkea una cuenta Google. (Se puede agregar en una pasada de hardening.)

## Usuarios y situaciones

| Usuario | Situación | Punto de contacto |
|---|---|---|
| Usuario nuevo, local | Llega a la app, quiere registrar sus finanzas | Form de registro (luego) → `POST /auth/register` |
| Usuario nuevo, Google | Prefiere signup con un click | Botón OAuth (luego) → `GET /auth/oauth/google` |
| Usuario recurrente, local | Tiene cuenta con password, vuelve días después | Form de login (luego) → `POST /auth/login` |
| Usuario recurrente, Google | Tiene cuenta vinculada a Google | Botón OAuth (luego) → `GET /auth/oauth/google` |
| Usuario activo, mixto | Se registró local, después vinculó Google | Cualquiera de los dos métodos funciona |
| Usuario activo, access expirado | Mid-sesión, JWT access expiró | `POST /auth/refresh` silencioso → 401 → redirect a login si el refresh también falla |
| Dispositivo comprometido | Quiere invalidar sesiones | `POST /auth/logout` para la sesión actual. Revocación completa es un cambio posterior. |

## Reglas de negocio

1. **El email es el identificador canónico.** Sin usernames. El email se normaliza (lowercase, trim) antes de guardar y consultar. La comparación es case-insensitive.
2. **Password local mínima**: 10 caracteres. Sin reglas de complejidad más allá del largo (NIST SP 800-63B).
3. **Parámetros de Argon2id**: calibrados a ~50-100ms de hash en la VM 1-CPU de Fly.io. Los params finales se deciden en design.
4. **La rotación de refresh tokens es obligatoria.** Cada refresh emite un refresh nuevo y revoca el viejo. Reusar un refresh revocado se trata como robo: se revoca la familia entera y el usuario tiene que re-loguearse.
5. **Los access tokens no se revocan** en MVP. Su vida útil de 15 minutos es el techo. Si alguna vez hace falta revocación de emergencia, agregamos `users.token_version` en un cambio posterior.
6. **Sin storage de password / token en logs, errores o response bodies.** La capa de schema strippea los campos sensibles.
7. **La enumeración de usuarios se mitiga**: register devuelve la misma forma de respuesta exista o no el email (error genérico, tiempo similar). Login dice "credenciales inválidas" sin revelar qué mitad falló.
8. **El email de OAuth tiene que estar verificado por Google** (`email_verified: true`). Si es false, rechazamos el registro y redirigimos a `/login?error=oauth_email_unverified`.
9. **Auto-link por match de email**: cuando Google devuelve un email que ya existe en nuestra DB (bajo cualquier provider), vinculamos la nueva fila de `oauth_accounts` al `users.id` existente. No se pide password. La fila de `oauth_accounts` es lo único que se crea; el usuario mantiene sus datos. (Ver nota de seguridad en implicaciones.)
10. **`default_provider` se setea en el primer registro** y nunca cambia. Es el método que se usa cuando el usuario tiene los dos. Lo usa `GET /auth/me` para renderizar el hint de "último login" en la UI.
11. **La callback URL de OAuth es fija y se valida server-side.** La cookie `state` y el parámetro `code` son los únicos inputs que aceptamos del redirect.
12. **Una cuenta OAuth por (provider, subject) globalmente.** El unique constraint en `oauth_accounts(provider, provider_subject)` impide que la misma cuenta de Google se vincule a dos usuarios. (Si un actor malicioso intentara vincular su Google a la cuenta de una víctima, el segundo link fallaría con 409.)

## Implicaciones e impacto

| Área | Impacto |
|---|---|
| **Base de datos** | Tablas nuevas `users` (con `password_hash` nullable), `refresh_tokens`, `oauth_accounts`. SQLite, propias de este cambio. |
| **Superficie de API** | 7 endpoints nuevos (5 local + 2 OAuth) bajo `/auth/*`. No es breaking change. |
| **Capa de dominio** | Nuevo módulo `auth`: entidades `User`, `RefreshToken`, `OAuthAccount`. `AuthService` con `register`, `login`, `refresh`, `logout`, `me`, `startGoogleOAuth`, `handleGoogleCallback`. |
| **Capa de aplicación** | Actions de auth orquestan servicios + DTOs. |
| **Infraestructura** | Argon2 + JWT + crypto-random + cliente OAuth (`arctic` o `google-auth-library`). Repositorios Drizzle. |
| **Eventos cross-module** | Evento `UserRegistered` emitido en el primer registro. Consumidores downstream se pueden suscribir (ej: para mandar email de bienvenida — fuera de alcance acá). |
| **UI** | Ninguna en este cambio. UI es `ui-auth-shell`. |
| **CI / deploy** | No hay deploy. Solo tests locales. Deploy en `fly-deploy`. Fly secrets nuevos: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. |
| **Docs bilingües** | Esta propuesta + spec + design espejados en `Documents-es/openspec/...`. |
| **Riesgo de seguridad** | **Auto-link por match de email** significa que quien controle un email controla la cuenta. Es estándar de industria (Notion, Linear, Vercel) pero vale flagearlo. La mitigación se difiere a una pasada de hardening si hace falta. |

## Casos borde (producto)

| Escenario | Comportamiento |
|---|---|
| Registro local con email ya usado | 409 `EMAIL_TAKEN`. Tiempo de respuesta similar al registro exitoso. |
| Registro local con email vacío | 400 `INVALID_EMAIL`. |
| Registro local con password de 5 chars | 400 `PASSWORD_TOO_SHORT`. |
| Login local con password incorrecta | 401 `INVALID_CREDENTIALS`. |
| Login local con email inexistente | 401 `INVALID_CREDENTIALS` (mismo shape que password incorrecta). |
| Login local cuando el usuario no tiene password (Google-only) | 401 `INVALID_CREDENTIALS` (no leak "no password"). |
| Callback OAuth con cookie `state` inválida | Redirect a `/login?error=oauth_state_mismatch`. No se crea usuario. |
| Callback OAuth con code expirado | Redirect a `/login?error=oauth_code_expired`. |
| Callback OAuth con token de Google revocado | Redirect a `/login?error=oauth_token_revoked`. |
| OAuth devuelve `email_verified: false` | Redirect a `/login?error=oauth_email_unverified`. No se crea usuario. |
| OAuth devuelve email ya vinculado al mismo usuario | Re-login. No se crea usuario nuevo, no se crea link nuevo. Se emiten tokens. |
| OAuth devuelve email vinculado a un usuario **distinto** | Auto-link al usuario existente. Nueva fila `oauth_accounts`. Se emiten tokens. (Estándar de industria. Nota de seguridad arriba.) |
| OAuth devuelve subject ya vinculado a un usuario (email distinto) | Rechazado con 409 `OAUTH_SUBJECT_TAKEN`. Es la única forma en que decimos "esta cuenta de Google ya está vinculada" — el unique constraint lo atrapa. |
| Refresh con refresh token expirado | 401 `REFRESH_EXPIRED`. Cliente redirige a login. |
| Refresh con refresh token revocado | 401 `REFRESH_REVOKED`. Familia revocada. Usuario debe re-loguearse. |
| Refresh con token malformado | 401 `INVALID_TOKEN`. |
| Access expirado pero refresh vigente | Refresh silencioso, sin interrupción visible. |
| Ambos tokens inválidos | 401 desde la API. Cliente limpia estado local y redirige a login. |
| Logout en un dispositivo | Solo se revoca la familia de ese refresh token. Otros dispositivos siguen funcionando. |
| Reinicio del server con sesiones activas | Los JWTs stateless sobreviven al reinicio. Los refresh tokens sobreviven (están en SQLite). Sin pérdida de sesión. |
| Dos dispositivos registran / loguean al mismo tiempo | Cada uno recibe tokens independientes. Sin contención. |
| La librería de Argon2 falla al cargar | 500 `INTERNAL_ERROR`. Logueado con stack, no expuesto. |
| DB locked durante register | Reintentar 3 veces con backoff exponencial (1s, 2s, 4s). Si sigue fallando, 503. |
| API de Google OAuth caída | 502 `OAUTH_PROVIDER_UNAVAILABLE`. Header `Retry-After`. |
| Usuario con 5+ providers OAuth en el futuro | Fuera de alcance por ahora. El schema lo soporta (una fila por provider por usuario). |

## Gaps de decisión (abiertos para la próxima ronda)

| Pregunta | Default si no se responde | Cómo resolver |
|---|---|---|
| ¿Necesitamos campo "confirmar password" en register? | Sí, cosa de UI (cambio posterior) | Cambio de UI, no de API de auth |
| ¿Qué pasa con los refresh tokens en un cambio de password? | Revocar todos. Usuario cierra sesión en todos lados. | Agregar a este cambio si producto lo quiere; si no, cambio separado. |
| ¿Soportamos múltiples dispositivos por usuario? | Sí (sin límite en MVP) | Implícito, sin código extra |
| ¿Qué pasa si el usuario quiere cambiar el email? | Fuera de alcance para MVP | Cambio separado |
| ¿Rate limiting en endpoints de auth? | Fuera de alcance. Cambio separado `security-rate-limiting` | Trackeado |
| ¿`oauth_accounts.provider_email` se actualiza si Google cambia el email del usuario? | Sí (audit trail) | TBD en design |
| ¿Mandamos email de notificación en auto-link? | No (fuera de alcance). Hardening futuro. | Trackear para más adelante |

## Aceptación (evidencia que verá el reviewer)

1. **Tests pasan**: `bun test` sale con 0. Coverage sobre el módulo `auth` ≥ 80% (línea + branch).
2. **Smoke manual**: `bun run start` → register local, login local, refresh, logout, me devuelven los status codes correctos. Flujo OAuth ejercitado end-to-end con un cliente Google de test. Ejemplos de curl en el handoff.
3. **Review adversarial**: subagente `reviewer` audita el diff con foco en: timing attacks, enumeración de usuarios, leak de tokens en logs, JWT algorithm confusion, elección de params de Argon2, correctness de rotación de refresh, protección CSRF del `state` OAuth, reuso de `code` OAuth, modelo de seguridad del auto-link, unique constraints de `oauth_accounts`.
4. **GGA**: `gga run` sale con 0. Output pegado en el handoff.
5. **Docs bilingües**: `openspec/changes/auth-foundation/proposal.md` y `Documents-es/openspec/changes/auth-foundation/proposal.md` están en sync. Detección de drift corre en el mismo commit.
6. **Doc de arquitectura actualizado**: `docs/architecture.md` (espejo en `Documents-es/docs/`) gana una sección "Auth" a la que esta propuesta linkea.

## Riesgos (mitigados)

| Riesgo | Mitigación |
|---|---|
| Params de Argon2 muy lentos en la VM free de Fly.io | Benchmark en la VM objetivo durante design; el spec incluye el tiempo objetivo. |
| JWT secret filtrado en logs o error | `JWT_SECRET` es un Fly secret (encrypted at rest), nunca se loguea. Lint rule prohíbe `console.log` en `auth/`. |
| Librería OAuth de Google se rompe en Bun | Validar en design. Fallback a fetch directo contra los endpoints de Google si la librería no anda. |
| La tabla `refresh_tokens` crece sin límite | Cambio posterior prun los tokens revocados con más de N días. Fuera de alcance acá. |
| La tabla `users` crece con basura | Cambio separado `user-deletion` maneja el cleanup estilo GDPR. |
| Race condition entre refreshes concurrentes | El unique constraint de DB + transacción hace que uno gane; el perdedor ve 401. Revocación de familia en reuso protege el escenario legítimo-luego-robado. |
| Mismatch en la callback URL de OAuth (env mal configurada) | El server valida el `APP_URL` configurado contra el `redirect_uri` enviado a Google. Falla rápido en el smoke test de design-time. |
| Auto-link es un riesgo de seguridad (documentado) | Estándar de industria, aceptado para MVP. Pasada de hardening trackeada. |
| `email_verified: false` aceptado por error | El server checkea explícitamente, rechaza con `oauth_email_unverified`. |

## Ordenamiento de cambios downstream

Después de este cambio, quedan desbloqueados:

1. `accounts-ledger` — necesita `user_id` y middleware de auth.
2. `fx-cache` — independiente de auth, pero ordenado acá por coherencia con "helpers de infra".
3. `networth-snapshot` — depende de `accounts-ledger`.
4. `reports-mvp` — depende de `accounts-ledger` + `networth-snapshot` + `fx-cache`.
5. `pwa-shell` — depende de `auth-foundation` (UI) + al menos un recurso protegido.
6. `fly-deploy` — independiente; cae al final.

## Próximo paso

Aprobar esta propuesta para desbloquear `sdd-spec` (deltas de spec para la capability `auth`) y `sdd-design` (decisiones sobre parámetros de Argon2, librería JWT, librería OAuth, forma del middleware, códigos de error).
