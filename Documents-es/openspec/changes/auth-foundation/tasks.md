# Tasks — `auth-foundation`

**Autor**: Sebastián Illa
**Cambio**: `auth-foundation`
**Estado**: listo-para-aplicar · **Creado**: 2026-06-09
**Upstream**: `openspec/changes/auth-foundation/proposal.md` (aprobada) ·
`openspec/changes/auth-foundation/design.md` (aprobada) ·
`openspec/specs/auth/spec.md` (canónica)
**Rama target**: `feat/auth-foundation` → `develop`
**Estrategia de PR**: 3 PRs encadenados (ver "Pronóstico de carga de review" abajo)
**Valores de preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · budget 400 líneas

## Goal

`auth-foundation` aterriza una capa de identidad completa y lista
para producción para `gastos-personales`. Cuando `sdd-apply`
termine, el sistema debe exponer siete endpoints HTTP
(`POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`,
`POST /auth/logout`, `GET /auth/me`, `GET /auth/oauth/google`,
`GET /auth/oauth/google/callback`) respaldados por tres tablas
SQLite (`users`, `refresh_tokens`, `oauth_accounts`), con hashing
de contraseñas Argon2id, access tokens JWT HS256, refresh tokens
opacos con rotación y revocación en cascada por familia, Google
OAuth 2.0 con auto-link por coincidencia de email, un
`authMiddleware` que fija `alg: HS256` y rechaza `alg: none`, y
cobertura de líneas + ramas ≥ 80 % en el módulo `auth` — todo
gated por `bun test`, `lint`, `typecheck` y `gga run`.

## Resumen de scope

- 3 tablas Drizzle + archivo de migración versionado (generado por Drizzle Kit).
- 3 entidades de dominio, 3 puertos de dominio, 5 servicios de dominio.
- 6 acciones de application + DTOs (una por familia de endpoints no-redirect).
- 7 rutas HTTP + 1 middleware + 1 wrapper `requireAuth`.
- 1 tipo de evento (`UserRegistered`) e integración con el dispatcher.
- 5 tests de seguridad (timing, reuse, state CSRF, alg confusion, secrets in logs).
- 5 ADRs, `docs/architecture.md` (sección Auth), `README.md` bilingüe.
- Workflow de CI (`.github/workflows/ci.yml`).
- Husky pre-commit (`gga run` + lint-staged) + commit-msg (commitlint) + pre-push.
- ESLint + Prettier + TypeScript strict + cobertura `bun test` ≥ 80 %.

## Mapa de arquitectura (forma final después de `sdd-apply`)

```
.
├── .env.example
├── .eslintrc.cjs
├── .github/
│   └── workflows/ci.yml
├── .gga
├── .gitignore                       # extendido para Bun, SQLite, coverage
├── .husky/
│   ├── commit-msg
│   ├── pre-commit                   # gga run + lint-staged
│   └── pre-push
├── .prettierrc
├── commitlint.config.js
├── docs/
│   ├── adr/
│   │   ├── 0001-argon2id-parameters.md
│   │   ├── 0002-jwt-library.md
│   │   ├── 0003-oauth-client-shape.md
│   │   ├── 0004-refresh-rotation-algorithm.md
│   │   └── 0005-auto-link-security-model.md
│   ├── architecture.md              # gana sección "Auth"
│   └── branch-protection.md
├── package.json
├── tsconfig.json
├── bun.lockb                        # generado
├── db/
│   └── migrations/0001_auth_foundation.sql   # generado por drizzle-kit
├── scripts/
│   └── bench-argon2.ts              # mide tiempo de hash en la VM target
└── src/
    ├── config/
    │   └── env.schema.ts
    ├── core/
    │   ├── crypto/
    │   │   └── web-crypto.ts        # random32, sha256Hex, hmacSign/Verify
    │   ├── errors/
    │   │   ├── app-error.ts
    │   │   └── error-codes.ts
    │   ├── events/
    │   │   ├── event-dispatcher.ts
    │   │   └── user-registered.event.ts
    │   ├── http/
    │   │   ├── error-handler.ts
    │   │   └── request-id.ts
    │   └── logger.ts
    └── modules/auth/
        ├── application/
        │   ├── actions/
        │   │   ├── login.action.ts
        │   │   ├── logout.action.ts
        │   │   ├── me.action.ts
        │   │   ├── oauth-callback.action.ts
        │   │   ├── refresh.action.ts
        │   │   ├── register.action.ts
        │   │   └── start-google-oauth.action.ts
        │   └── dto/
        │       ├── login.dto.ts
        │       ├── logout.dto.ts
        │       ├── oauth-callback.dto.ts
        │       ├── refresh.dto.ts
        │       └── register.dto.ts
        ├── domain/
        │   ├── entities/
        │   │   ├── oauth-account.ts
        │   │   ├── refresh-token.ts
        │   │   └── user.ts
        │   ├── interfaces/
        │   │   ├── oauth-account.repository.port.ts
        │   │   ├── refresh-token.repository.port.ts
        │   │   └── user.repository.port.ts
        │   ├── services/
        │   │   ├── auth.service.ts
        │   │   ├── oauth.service.ts
        │   │   ├── password.service.ts
        │   │   ├── refresh-token.service.ts
        │   │   └── token.service.ts
        │   └── value-objects/
        │       └── public-user.ts
        ├── infrastructure/
        │   ├── external/
        │   │   ├── argon2.hasher.ts
        │   │   ├── google-oauth.client.ts
        │   │   └── jose.jwt.ts
        │   ├── repositories/
        │   │   ├── oauth-account.repository.ts
        │   │   ├── refresh-token.repository.ts
        │   │   └── user.repository.ts
        │   └── schema.ts             # definiciones de tablas Drizzle
        ├── middleware/
        │   └── auth.middleware.ts
        ├── routes/
        │   ├── local.routes.ts       # register, login, refresh, logout, me
        │   └── oauth.routes.ts       # start, callback
        ├── __tests__/
        │   └── security/
        │       ├── jwt.algorithm-confusion.test.ts
        │       ├── login.timing.test.ts
        │       ├── oauth.state-csrf.test.ts
        │       ├── refresh.reuse.test.ts
        │       └── secrets.in-logs.test.ts
        └── index.ts                  # API pública
```

`src/modules/auth/index.ts` exporta la superficie pública: montaje
de rutas, `authMiddleware`, `requireAuth`, y la firma del
constructor de `AuthService` para testing. Nada más en el codebase
accede a los internos del módulo.

## Lista de tareas

> **Disciplina TDD.** Cada tarea es un par: el archivo de tests
> se escribe y se commitea **primero** (RED), después se escribe
> la implementación para hacerlo pasar (GREEN), y después se
> incorpora cualquier cleanup obvio (REFACTOR). Las líneas
> `Tests` y `Verify` abajo reflejan esto por tarea. Según
> `openspec/config.yaml`, `strictTdd.enabled` es `false`, pero el
> criterio de aceptación del usuario es "App + tests + docs + CI
> verde" — strict TDD es la convención local. El test runner es
> `bun test`.

### Phase 0 — Scaffolding (el piso sobre el que se sostiene todo lo demás)

- [ ] **T-001** Inicializar el proyecto raíz con Bun + TypeScript
  - **Scope**: `bun init`, agregar `package.json` con los scripts
    `dev`/`build`/`start`/`lint`/`typecheck`/`test`/`test:coverage`,
    configurar el pineo de versión de Node específico de Bun, y
    commitear `bun.lockb` cuando el lockfile se estabilice. Sin
    código de auth todavía.
  - **Files**: `package.json`, `tsconfig.json` (strict), `bun.lockb`
  - **Lines estimate**: 60
  - **Depends on**: none
  - **Tests**: N/A (scaffolding). `bun test` se invoca con cero
    tests y sale 0.
  - **Verify**: `bun install` sale 0; `bun test` sale 0 con
    "no tests found" (no es error); `bun run typecheck` sale 0.

- [ ] **T-002** Configurar ESLint, Prettier, `.editorconfig`
  - **Scope**: `eslint` con `@typescript-eslint` recommended
    + `eslint-config-prettier` para deshabilitar reglas en
    conflicto, más defaults de Prettier (sin punto y coma), y
    `.editorconfig` para indentación + charset. Agrega los
    scripts `lint` y `format`.
  - **Files**: `.eslintrc.cjs`, `.prettierrc`, `.editorconfig`
  - **Lines estimate**: 60
  - **Depends on**: T-001
  - **Tests**: N/A. Lint es un gate, no un comportamiento
    unit-testeado.
  - **Verify**: `bun run lint` sale 0 sobre un `src/index.ts`
    stub que exporta `const x = 1;`.

- [ ] **T-003** Instalar Husky + commitlint + lint-staged + wirear GGA pre-commit
  - **Scope**: `husky` init crea `.husky/`. `commit-msg` corre
    `npx commitlint --edit "$1"`. `pre-commit` corre
    `npx lint-staged` (que corre ESLint + Prettier sobre los
    archivos staged) y después `gga run` sobre los archivos
    staged. `pre-push` valida el nombre de rama contra
    `^(feat|fix|chore|docs|refactor|test|build|ci|perf|revert)/[a-z0-9-]+$`
    y rechaza pushes a `main` o `master`. `commitlint.config.js`
    extiende `@commitlint/config-conventional`.
  - **Files**: `.husky/commit-msg`, `.husky/pre-commit`,
    `.husky/pre-push`, `commitlint.config.js`, `.gga` (lo
    agrega `gga init`; o se escribe a mano si no está
    instalado todavía)
  - **Lines estimate**: 80
  - **Depends on**: T-001, T-002
  - **Tests**: Un `scripts/verify-hooks.sh` smoke-testea cada
    hook con un mensaje de commit y nombre de rama fixture.
  - **Verify**: `git commit -m "feat: smoke"` dispara el
    hook pre-commit, que sale 0 en un árbol limpio y no-cero
    con un `console.log` en código staged. `git push` desde
    una rama llamada `badbranch` es rechazado.

- [ ] **T-004** Crear el `.env.example` raíz y extender `.gitignore`
  - **Scope**: `.env.example` lista cada env var del schema de
    env del design (`NODE_ENV`, `DATABASE_URL`, `JWT_SECRET`,
    `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TTL_SECONDS`,
    `COOKIE_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
    `GOOGLE_REDIRECT_URI`, `APP_URL`, `PORT`) con placeholders
    vacíos y comentarios de una línea explicando cada uno.
    `.gitignore` extiende el init existente para cubrir
    `node_modules/`, `dist/`, `build/`, `coverage/`, `*.db`,
    `*.db-journal`, `.env`, `.env.*.local`, `bun.lockb.bak`.
    Confirma el patrón OpenSpec de `.env.example` commiteado,
    `.env` ignorado.
  - **Files**: `.env.example`, `.gitignore` (modificado)
  - **Lines estimate**: 40
  - **Depends on**: T-001
  - **Tests**: N/A. El Zod schema en T-005 es la superficie
    testeable para estos valores.
  - **Verify**: `git check-ignore -v .env` retorna 0;
    `git check-ignore -v .env.example` retorna 1 (NO ignorado);
    `cat .env.example | grep -c JWT_SECRET` retorna 1.

### Phase 1 — Shared infrastructure (env, errors, logger, crypto)

- [ ] **T-005** Escribir el Zod env schema con tests
  - **Scope (RED → GREEN → REFACTOR)**: los tests del env
    schema viven en `src/config/env.schema.test.ts`. Cubren:
    cada clave requerida faltante ⇒ throws; `JWT_SECRET` con
    longitud < 32 ⇒ throws; `DATABASE_URL` vacío ⇒ throws;
    `GOOGLE_REDIRECT_URI` no es URL ⇒ throws; `PORT` se
    coercea a número; validación de enum de `NODE_ENV`;
    aserción cross-field
    `new URL(env.GOOGLE_REDIRECT_URI).origin === new URL(env.APP_URL).origin`
    falla rápido. Una vez que los tests están rojos, se
    implementa el schema y se re-corre hasta verde.
  - **Files**: `src/config/env.schema.test.ts`,
    `src/config/env.schema.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-001
  - **Tests**: 7 casos. Patrón AAA. Parametrizado vía
    `it.each` table-driven. Sin `if/else/for` en el cuerpo
    de los tests.
  - **Verify**: `bun test src/config/env.schema.test.ts`
    sale 0. `bun test` general sigue saliendo 0.

- [ ] **T-006** Escribir la clase `AppError` y constantes de códigos de error
  - **Scope (RED → GREEN)**: `src/core/errors/app-error.test.ts`
    assertea que el constructor de `AppError` guarda `code`,
    `statusCode`, `details`; `instanceof Error` es true;
    `name === 'AppError'`. `src/core/errors/error-codes.ts`
    exporta el enum exhaustivo de códigos de la sección
    "Error codes" del spec, con los mapeos de status HTTP.
  - **Files**: `src/core/errors/app-error.test.ts`,
    `src/core/errors/app-error.ts`,
    `src/core/errors/error-codes.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-005
  - **Tests**: 4 casos para `AppError`. `error-codes.ts` se
    type-checkea en tiempo de compilación; el test importa
    cada constante y assertea el tipo.
  - **Verify**: `bun test src/core/errors/` sale 0;
    `bun run typecheck` sale 0.

- [ ] **T-007** Logger + middleware de request-id + middleware de error handler
  - **Scope (RED → GREEN)**: los tests del logger assertean
    que las claves sensibles (`password`, `refresh_token`,
    `authorization`, `cookie`, `code`) se filtran del output
    del log sin importar el objeto de entrada. Los tests del
    middleware de request-id assertean que un `X-Request-Id`
    entrante se hace eco de vuelta, y que un header faltante
    obtiene un uuid v7 fresco. Los tests del error handler
    assertean la forma de respuesta
    `{ error: { code, message, details? } }`, el `requestId`
    en cada línea de log, y que los `details` de `AppError`
    se transmiten mientras que el `Error.message` crudo no.
  - **Files**: `src/core/logger.ts`,
    `src/core/logger.test.ts`,
    `src/core/http/request-id.ts`,
    `src/core/http/request-id.test.ts`,
    `src/core/http/error-handler.ts`,
    `src/core/http/error-handler.test.ts`
  - **Lines estimate**: 100
  - **Depends on**: T-005, T-006
  - **Tests**: 8 casos en los tres módulos. Patrón AAA.
    Parametrizado para la allow-list del logger.
  - **Verify**: `bun test src/core/` sale 0 con cobertura
    ≥ 80 % en `src/core/logger.ts` y `src/core/http/`.

- [ ] **T-008** Helpers de Web Crypto (random32, sha256Hex, HMAC sign/verify)
  - **Scope (RED → GREEN)**: `src/core/crypto/web-crypto.test.ts`
    assertea: `random32Base64Url()` retorna un string
    base64url de 43 chars con 32 bytes de entropía; dos
    llamadas seguidas difieren; `sha256Hex(input)` es
    determinístico y matchea el sha256 Node-compatible de un
    string conocido; HMAC sign/verify es simétrico; un mensaje
    adulterado falla la verificación. Todas las operaciones
    usan Web Crypto (`crypto.getRandomValues`,
    `crypto.subtle.digest`, `crypto.subtle.sign/verify`).
  - **Files**: `src/core/crypto/web-crypto.ts`,
    `src/core/crypto/web-crypto.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-005
  - **Tests**: 6 casos. Patrón AAA.
  - **Verify**: `bun test src/core/crypto/web-crypto.test.ts`
    sale 0.

### Phase 2 — Auth domain (entidades, puertos, servicios, evento)

- [ ] **T-009** Entidades de dominio (`User`, `RefreshToken`, `OAuthAccount`) + proyección `PublicUser`
  - **Scope (RED → GREEN)**: los tests assertean que las
    factory functions de las entidades normalizan el email
    (lowercase + trim) y rechazan input malformado.
    `PublicUser.from(user)` strippea `passwordHash`.
    `RefreshToken.isActive(now)` retorna false en tokens
    revocados o expirados. `OAuthAccount` es un value-shape
    object; los tests assertean que los nombres de campo
    matchean el spec exactamente.
  - **Files**: `src/modules/auth/domain/entities/user.ts`,
    `src/modules/auth/domain/entities/refresh-token.ts`,
    `src/modules/auth/domain/entities/oauth-account.ts`,
    `src/modules/auth/domain/value-objects/public-user.ts`,
    `src/modules/auth/domain/entities/user.test.ts`,
    `src/modules/auth/domain/entities/refresh-token.test.ts`,
    `src/modules/auth/domain/value-objects/public-user.test.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-006
  - **Tests**: 7 casos. Patrón AAA. Parametrizado para los
    casos de normalización de email.
  - **Verify**: `bun test src/modules/auth/domain/entities/`
    sale 0; `bun test src/modules/auth/domain/value-objects/`
    sale 0.

- [ ] **T-010** Interfaces de puertos de dominio (3 puertos) + helper uuid v7
  - **Scope (RED → GREEN)**: los puertos son interfaces de
    TypeScript, no valores de runtime; el "test" es un smoke
    a nivel de tipos (una implementación fake compila).
    `uuidV7()` es un helper real con tests que assertean:
    retorna un string de longitud 36 con la forma v7 esperada;
    llamadas consecutivas son monótonamente no-decrecientes
    en el prefijo de timestamp.
  - **Files**: `src/modules/auth/domain/interfaces/user.repository.port.ts`,
    `src/modules/auth/domain/interfaces/refresh-token.repository.port.ts`,
    `src/modules/auth/domain/interfaces/oauth-account.repository.port.ts`,
    `src/core/uuid/uuid-v7.ts`,
    `src/core/uuid/uuid-v7.test.ts`
  - **Lines estimate**: 40
  - **Depends on**: T-009
  - **Tests**: 2 casos para `uuidV7` (forma + monotonicidad).
  - **Verify**: `bun test src/core/uuid/` sale 0;
    `bun run typecheck` sale 0 (los puertos compilan).

- [ ] **T-011** `PasswordService` (wrapper Argon2id) + script de benchmark
  - **Scope (RED → GREEN)**: los tests assertean: `hash('a-password')`
    retorna un string que empieza con `$argon2id$`;
    `verify(hash, 'a-password')` es `true`; `verify(hash, 'b-password')`
    es `false`; dos llamadas consecutivas a `hash` producen
    sales diferentes (el output es no-determinístico). El
    script de benchmark `scripts/bench-argon2.ts` mide p50
    del tiempo de hash en la máquina del desarrollador (y se
    corre después en la VM de Fly en `fly-deploy`). Los
    parámetros elegidos se codifican como constantes:
    `memoryCost = 19456` KiB, `timeCost = 2`,
    `parallelism = 1` (el target del design).
  - **Files**: `src/modules/auth/domain/services/password.service.ts`,
    `src/modules/auth/domain/services/password.service.test.ts`,
    `scripts/bench-argon2.ts`
  - **Lines estimate**: 100
  - **Depends on**: T-008, T-009
  - **Tests**: 4 casos. Patrón AAA. Parametrizado para
    input válido/inválido.
  - **Verify**: `bun test src/modules/auth/domain/services/password.service.test.ts`
    sale 0; `bun scripts/bench-argon2.ts` corre hasta
    completarse e imprime un tiempo de hash en milisegundos.

- [ ] **T-012** `TokenService` (jose JWT)
  - **Scope (RED → GREEN)**: los tests assertean: `signAccessToken({ sub })`
    produce un JWT de 3 partes cuyo header decodea a
    `alg: HS256`; `verifyAccessToken(token)` retorna el
    payload original para un token válido; tokens expirados
    throw; tokens firmados con un secret diferente throw;
    tokens con `alg: none` son rechazados (el pin
    `algorithms: ['HS256']`); tokens con `alg: RS256` son
    rechazados incluso cuando se firman con una "clave
    matching". El tipo `JwtPayload` matchea el design.
  - **Files**: `src/modules/auth/domain/services/token.service.ts`,
    `src/modules/auth/domain/services/token.service.test.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-005, T-008
  - **Tests**: 7 casos. Patrón AAA. Parametrizado para los
    casos del ataque de `alg`-confusion.
  - **Verify**: `bun test src/modules/auth/domain/services/token.service.test.ts`
    sale 0.

- [ ] **T-013** `OAuthService` (generación de state, HMAC sign/verify, builder de authorize URL)
  - **Scope (RED → GREEN)**: los tests assertean: `generateState()`
    retorna un string base64url de 32 bytes; `signState(state)`
    es determinístico para un `COOKIE_SECRET` fijo;
    `verifyState(signed, original)` retorna `true` para pares
    que matchean y `false` después de un flip de byte;
    `buildAuthorizeUrl({ clientId, redirectUri, state, prompt })`
    retorna una URL cuyos `searchParams` incluyen
    `client_id`, `redirect_uri`, `response_type=code`,
    `scope=openid email profile`, `state` (el valor firmado),
    `prompt=select_account` (el default confirmado por el
    usuario), y cuyo `origin` es
    `https://accounts.google.com`.
  - **Files**: `src/modules/auth/domain/services/oauth.service.ts`,
    `src/modules/auth/domain/services/oauth.service.test.ts`
  - **Lines estimate**: 70
  - **Depends on**: T-005, T-008
  - **Tests**: 6 casos. Patrón AAA. Parametrizado para los
    pares de sign/verify (match, mismatch, state alterado).
  - **Verify**: `bun test src/modules/auth/domain/services/oauth.service.test.ts`
    sale 0.

- [ ] **T-014** `RefreshTokenService` (rotación + cascada por familia)
  - **Scope (RED → GREEN)**: los tests assertean el algoritmo
    del design: `rotate(plaintext)` encuentra la fila por
    sha256 hash; si no existe, throws `INVALID_TOKEN`; si
    expiró, throws `REFRESH_EXPIRED`; si está revocada,
    throws `REFRESH_REVOKED` después de revocar la familia
    entera; en éxito, inserta una nueva fila con el mismo
    `family_id`, marca la fila vieja
    `revoked_at = now, replaced_by = newId`. Los tests
    usan un `RefreshTokenRepository` fake (contrato de
    interface, no DB real). La race de rotación concurrente
    se parametriza: dos llamadas con el mismo plaintext
    terminan con un éxito y una revocación de familia.
  - **Files**: `src/modules/auth/domain/services/refresh-token.service.ts`,
    `src/modules/auth/domain/services/refresh-token.service.test.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-008, T-009, T-010
  - **Tests**: 7 casos. Patrón AAA. El caso concurrente usa
    un fake in-memory determinístico.
  - **Verify**: `bun test src/modules/auth/domain/services/refresh-token.service.test.ts`
    sale 0; cobertura de ramas ≥ 80 % en el archivo del
    servicio.

- [ ] **T-015** `AuthService` (orquestador: register, login, refresh, logout, me, startGoogleOAuth, handleGoogleCallback)
  - **Scope (RED → GREEN)**: los tests assertean los siete
    comportamientos del spec, todos con puertos fake (sin
    DB, sin HTTP). Cobertura:
    - `register`: email nuevo ⇒ éxito; email existente ⇒
      `EMAIL_TAKEN` con timing comparable (assertado vía una
      propiedad libre de side-channel: la llamada del action
      a `hash` ocurre en ambas ramas).
    - `login`: válido ⇒ éxito; password incorrecto ⇒
      `INVALID_CREDENTIALS`; email desconocido ⇒
      `INVALID_CREDENTIALS` (y `verify` se llama contra un
      hash dummy para igualar timing); usuario Google-only
      ⇒ `INVALID_CREDENTIALS`.
    - `refresh`: delega en `RefreshTokenService.rotate`.
    - `logout`: marca la fila revocada; idempotente sobre
      desconocida.
    - `me`: retorna el `PublicUser` para el `user_id` dado.
    - `startGoogleOAuth`: retorna una redirect URL con un
      state firmado fresco.
    - `handleGoogleCallback`: ata `OAuthService`, el user
      repository, el oauth-accounts repository y el
      refresh-token service para los cinco modos de
      éxito/fallo del spec.
  - **Files**: `src/modules/auth/domain/services/auth.service.ts`,
    `src/modules/auth/domain/services/auth.service.test.ts`
  - **Lines estimate**: 150
  - **Depends on**: T-011, T-012, T-013, T-014
  - **Tests**: 18 casos. Patrón AAA. Todas las interacciones
    con puertos se graban con un fake spy; sin lógica en el
    cuerpo de los tests.
  - **Verify**: `bun test src/modules/auth/domain/services/auth.service.test.ts`
    sale 0; cobertura de líneas + ramas ≥ 80 % en el archivo
    del servicio.

- [ ] **T-016** Tipo de evento `UserRegistered` + integración con dispatcher
  - **Scope (RED → GREEN)**: un registro de eventos tipado
    en `src/core/events/event-dispatcher.ts` acepta una
    unión de tipos de evento; `dispatch({ type: 'UserRegistered', payload })`
    corre los subscriptores registrados (sin subscriptores en
    este cambio, pero el wiring existe para el welcome-email
    worker que sale después). El test assertea que
    `auth.service.register` llama a `dispatch` exactamente
    una vez en el primer registro, y nunca en el camino
    de auto-link.
  - **Files**: `src/core/events/event-dispatcher.ts`,
    `src/core/events/event-dispatcher.test.ts`,
    `src/core/events/user-registered.event.ts`
  - **Lines estimate**: 30
  - **Depends on**: T-015
  - **Tests**: 2 casos. Patrón AAA.
  - **Verify**: `bun test src/core/events/` sale 0.

### Phase 3 — Auth infrastructure (Drizzle schema, repos, adapters externos)

- [ ] **T-017** Drizzle schema (3 tablas, índices) + migración versionada
  - **Scope (RED → GREEN)**: el schema de Drizzle en
    `src/modules/auth/infrastructure/schema.ts` define
    `users`, `refresh_tokens`, `oauth_accounts` según el
    design. Los tests usan `:memory:` SQLite de `bun:test`
    para aplicar la migración y assertear las formas de las
    tablas: `users` tiene las columnas
    `id, email, password_hash, email_verified, default_provider, created_at, updated_at`;
    existe el índice único en `email`; existe el índice único
    compuesto en `oauth_accounts(provider, provider_subject)`;
    existen los índices en `refresh_tokens.user_id` y
    `refresh_tokens.family_id`. El archivo de migración en
    `db/migrations/0001_auth_foundation.sql` se genera con
    `bunx drizzle-kit generate` y se commitea.
  - **Files**: `src/modules/auth/infrastructure/schema.ts`,
    `src/modules/auth/infrastructure/schema.test.ts`,
    `drizzle.config.ts`,
    `db/migrations/0001_auth_foundation.sql` (generado)
  - **Lines estimate**: 80
  - **Depends on**: T-001, T-005
  - **Tests**: 4 casos que introspeccionan `sqlite_master`
    después de aplicar la migración.
  - **Verify**: `bunx drizzle-kit generate` produce
    `db/migrations/0001_auth_foundation.sql` con los tres
    statements `CREATE TABLE` y los cuatro statements
    `CREATE INDEX`; `bun test src/modules/auth/infrastructure/schema.test.ts`
    sale 0.

- [ ] **T-018** `UsersRepository` (adapter Drizzle)
  - **Scope (RED → GREEN)**: tests contra un SQLite
    in-memory cubren: `insert` retorna la fila con todos los
    campos persistidos; `findById` retorna `null` para ids
    desconocidos; `findByEmail` es case-insensitive
    (insertar `'A@B.com'`, buscar `'a@b.com'`, obtener la
    fila); `update` muta `updated_at`. El repository
    implementa `UserRepositoryPort` de T-010.
  - **Files**: `src/modules/auth/infrastructure/repositories/user.repository.ts`,
    `src/modules/auth/infrastructure/repositories/user.repository.test.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-017
  - **Tests**: 4 casos. Patrón AAA. Cada test usa un
    `:memory:` SQLite fresco.
  - **Verify**: `bun test src/modules/auth/infrastructure/repositories/user.repository.test.ts`
    sale 0.

- [ ] **T-019** `RefreshTokensRepository` (insert, findByHash, findByFamily, revokeFamily)
  - **Scope (RED → GREEN)**: los tests cubren: `insert`
    retorna la fila; `findByHash` retorna la fila para el
    sha256 correcto y `null` en cualquier otro caso;
    `findByFamily` retorna todas las filas de la familia;
    `revokeFamily(familyId, now)` setea `revoked_at` en
    cada fila activa de la familia (parametrizado: 0/1/3
    filas, todas en estado activo, una ya revocada). El
    repository implementa `RefreshTokenRepositoryPort`.
  - **Files**: `src/modules/auth/infrastructure/repositories/refresh-token.repository.ts`,
    `src/modules/auth/infrastructure/repositories/refresh-token.repository.test.ts`
  - **Lines estimate**: 70
  - **Depends on**: T-017
  - **Tests**: 5 casos. Patrón AAA. Parametrizado para el
    tamaño de familia.
  - **Verify**: `bun test src/modules/auth/infrastructure/repositories/refresh-token.repository.test.ts`
    sale 0.

- [ ] **T-020** `OAuthAccountsRepository` (insert, findByProviderSubject, updateProviderEmail)
  - **Scope (RED → GREEN)**: los tests cubren: `insert`
    retorna la fila; `findByProviderSubject('google', 'sub-1')`
    retorna la fila y `null` para subjects desconocidos;
    `updateProviderEmail(id, newEmail)` muta la fila; la
    unique constraint compuesta sobre `(provider, provider_subject)`
    se enforcea a nivel DB (el test assertea que un segundo
    `insert` con el mismo `(provider, provider_subject)`
    throws). `updateProviderEmail` es el helper que usa el
    callback de OAuth para mantener `provider_email` en
    sync con el email actual de Google (el comportamiento
    confirmado por el usuario).
  - **Files**: `src/modules/auth/infrastructure/repositories/oauth-account.repository.ts`,
    `src/modules/auth/infrastructure/repositories/oauth-account.repository.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-017
  - **Tests**: 5 casos. Patrón AAA.
  - **Verify**: `bun test src/modules/auth/infrastructure/repositories/oauth-account.repository.test.ts`
    sale 0.

- [ ] **T-021** Adapters externos: Argon2 hasher, jose JWT, Google OAuth client
  - **Scope (RED → GREEN)**: tres adapters pequeños en
    `infrastructure/external/` que satisfacen los puertos
    que esperan los servicios de dominio:
    1. `Argon2Hasher` wrappea la biblioteca elegida
       (`@node-rs/argon2`) con los parámetros de T-011.
    2. `JoseJwt` wrappea `SignJWT` y `jwtVerify` de `jose`
       con `alg: HS256` pineado.
    3. `GoogleOAuthClient` usa `arctic` para helpers de
       state y `fetch` directo contra
       `https://oauth2.googleapis.com/token` y
       `https://openidconnect.googleapis.com/v1/userinfo`.
       El client expone `exchangeCode(code)` y
       `fetchUserInfo(accessToken)`; ambos retornan
       resultados tipados. Los errores se mapean a los
       códigos del spec `oauth_code_expired`,
       `oauth_token_revoked`, `oauth_provider_unavailable`,
       `oauth_userinfo_failed`, `oauth_email_missing`,
       `oauth_email_unverified` según la respuesta de
       Google.
  - **Files**: `src/modules/auth/infrastructure/external/argon2.hasher.ts`,
    `src/modules/auth/infrastructure/external/jose.jwt.ts`,
    `src/modules/auth/infrastructure/external/google-oauth.client.ts`,
    `src/modules/auth/infrastructure/external/google-oauth.client.test.ts`
    (solo el client de Google se unit-testea acá; Argon2 y
    jose ya están cubiertos por T-011 y T-012)
  - **Lines estimate**: 130
  - **Depends on**: T-011, T-012, T-013
  - **Tests**: 9 casos para el client de Google. Patrón
    AAA. Las respuestas del fetch se stubbean con
    `mock()` de `bun:test`; sin llamadas reales de red.
    Parametrizado para la tabla de mapeo de errores.
  - **Verify**: `bun test src/modules/auth/infrastructure/external/`
    sale 0.

### Phase 4 — Auth application (acciones + DTOs)

- [ ] **T-022** `registerAction` + DTO
  - **Scope (RED → GREEN)**: el DTO usa `zod` para validar
    `{ email, password }` (formato de email, longitud de
    password ≥ 10). La acción delega en `AuthService.register`
    y retorna un `{ data: { user, access_token, refresh_token, ... } }`
    tipado en éxito o un `{ error: { code, message, details? } }`
    tipado en fallo. Los tests cubren: 201 éxito, 400
    `INVALID_EMAIL`, 400 `PASSWORD_TOO_SHORT`, 400
    `VALIDATION_ERROR` (otros fallos de Zod), 409
    `EMAIL_TAKEN`. El requisito de "timing comparable" se
    chequea indirectamente asserteando que la llamada a
    `hash` se hace tanto en la rama de éxito como en
    `EMAIL_TAKEN`.
  - **Files**: `src/modules/auth/application/dto/register.dto.ts`,
    `src/modules/auth/application/dto/register.dto.test.ts`,
    `src/modules/auth/application/actions/register.action.ts`,
    `src/modules/auth/application/actions/register.action.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-015, T-018, T-020
  - **Tests**: 5 casos. Patrón AAA.
  - **Verify**: `bun test src/modules/auth/application/actions/register.action.test.ts`
    sale 0.

- [ ] **T-023** `loginAction` + DTO (mitigación de user-enumeration)
  - **Scope (RED → GREEN)**: los tests assertean los tres
    modos de fallo (`unknown email`, `wrong password`,
    `Google-only user`) que retornan forma idéntica de
    `INVALID_CREDENTIALS` y el timing de la acción es
    comparable (el test de seguridad de timing en T-032
    mide esto a nivel de integración; acá el test
    assertea que `passwordService.verify` se llama contra
    un hash real en el caso "wrong password" y contra un
    hash dummy constante en el caso "unknown email").
  - **Files**: `src/modules/auth/application/dto/login.dto.ts`,
    `src/modules/auth/application/dto/login.dto.test.ts`,
    `src/modules/auth/application/actions/login.action.ts`,
    `src/modules/auth/application/actions/login.action.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-015, T-018, T-019
  - **Tests**: 4 casos. Patrón AAA.
  - **Verify**: `bun test src/modules/auth/application/actions/login.action.test.ts`
    sale 0.

- [ ] **T-024** `refreshAction` + DTO (rotación)
  - **Scope (RED → GREEN)**: los tests assertean: 200 con
    nuevo par en un token válido; 401 `INVALID_TOKEN` ante
    token malformado o desconocido; 401 `REFRESH_EXPIRED`
    ante `expires_at` en el pasado; 401 `REFRESH_REVOKED`
    después de la cascada de familia. La acción es un
    wrapper fino sobre `AuthService.refresh`; el algoritmo
    de rotación ya está cubierto por T-014 y T-015.
  - **Files**: `src/modules/auth/application/dto/refresh.dto.ts`,
    `src/modules/auth/application/dto/refresh.dto.test.ts`,
    `src/modules/auth/application/actions/refresh.action.ts`,
    `src/modules/auth/application/actions/refresh.action.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-015, T-019
  - **Tests**: 4 casos. Patrón AAA.
  - **Verify**: `bun test src/modules/auth/application/actions/refresh.action.test.ts`
    sale 0.

- [ ] **T-025** `logoutAction` + `meAction` + DTOs
  - **Scope (RED → GREEN)**: `logout` retorna 204 ante
    token válido, 401 `INVALID_TOKEN` ante desconocido
    (idempotente en espíritu; el spec dice que desconocido
    es no-op pero la acción igual retorna 401 porque no
    hay token válido que confirmar). `me` retorna
    `{ data: PublicUser }` para un JWT válido; 401
    `UNAUTHORIZED` ante faltante/expirado. Las acciones
    consumen el user id del contexto del `authMiddleware`
    (el test inyecta un contexto fake).
  - **Files**: `src/modules/auth/application/dto/logout.dto.ts`,
    `src/modules/auth/application/dto/logout.dto.test.ts`,
    `src/modules/auth/application/actions/logout.action.ts`,
    `src/modules/auth/application/actions/logout.action.test.ts`,
    `src/modules/auth/application/actions/me.action.ts`,
    `src/modules/auth/application/actions/me.action.test.ts`
  - **Lines estimate**: 50
  - **Depends on**: T-015, T-018, T-019
  - **Tests**: 4 casos en las dos acciones. Patrón AAA.
  - **Verify**: `bun test src/modules/auth/application/actions/logout.action.test.ts src/modules/auth/application/actions/me.action.test.ts`
    sale 0.

- [ ] **T-026** `oauthCallbackAction` + `startGoogleOAuthAction` + DTO
  - **Scope (RED → GREEN)**: `startGoogleOAuth` retorna una
    forma `{ status: 302, headers: { Location: <authorizeUrl>, 'Set-Cookie': oauth_state=... } }`
    que traduce la capa de rutas. La acción del callback
    de OAuth cubre la lista exhaustiva de errores del
    spec: `oauth_state_mismatch`, `oauth_code_expired`,
    `oauth_token_revoked`, `oauth_email_unverified`,
    `oauth_email_missing`, `oauth_subject_taken`,
    `oauth_provider_unavailable`, `oauth_userinfo_failed`,
    más el happy path (new user, auto-link, re-login). En
    auto-link y re-login, `provider_email` se actualiza
    vía el helper `OAuthAccountsRepository.updateProviderEmail`
    de T-020. El happy path de primer registro emite
    `UserRegistered` exactamente una vez.
  - **Files**: `src/modules/auth/application/dto/oauth-callback.dto.ts`,
    `src/modules/auth/application/dto/oauth-callback.dto.test.ts`,
    `src/modules/auth/application/actions/oauth-callback.action.ts`,
    `src/modules/auth/application/actions/oauth-callback.action.test.ts`,
    `src/modules/auth/application/actions/start-google-oauth.action.ts`,
    `src/modules/auth/application/actions/start-google-oauth.action.test.ts`
  - **Lines estimate**: 100
  - **Depends on**: T-015, T-018, T-019, T-020, T-021
  - **Tests**: 11 casos. Patrón AAA. Parametrizado para la
    tabla de mapeo de errores.
  - **Verify**: `bun test src/modules/auth/application/actions/oauth-callback.action.test.ts src/modules/auth/application/actions/start-google-oauth.action.test.ts`
    sale 0; el evento `UserRegistered` se dispatchea
    exactamente una vez a lo largo de la corrida de tests.

### Phase 5 — Auth UI (rutas HTTP + middleware)

- [ ] **T-027** `authMiddleware` + wrapper `requireAuth`
  - **Scope (RED → GREEN)**: los tests assertean: header
    `Authorization` faltante ⇒ 401 `UNAUTHORIZED`; header
    malformado (sin espacio, sin esquema `Bearer`) ⇒ 401
    `UNAUTHORIZED`; JWT expirado ⇒ 401; mismatch de
    firma ⇒ 401; token con `alg: none` ⇒ 401; token con
    `alg: RS256` ⇒ 401; token válido + usuario existente
    ⇒ contexto poblado con `{ user, user_id }`; token
    válido + usuario borrado ⇒ 401. La implementación del
    middleware vive en
    `src/modules/auth/middleware/auth.middleware.ts`. El
    wrapper `requireAuth` es un helper sintáctico fino que
    usa la capa de rutas para declarar "esta ruta está
    protegida".
  - **Files**: `src/modules/auth/middleware/auth.middleware.ts`,
    `src/modules/auth/middleware/auth.middleware.test.ts`
  - **Lines estimate**: 60
  - **Depends on**: T-012, T-015, T-018
  - **Tests**: 8 casos. Patrón AAA. Parametrizado para los
    modos de fallo.
  - **Verify**: `bun test src/modules/auth/middleware/auth.middleware.test.ts`
    sale 0.

- [ ] **T-028** Rutas locales de auth (register, login, refresh, logout, me)
  - **Scope (RED → GREEN)**: el módulo de rutas expone
    cinco handlers. Cada handler:
    1. Valida el request con el DTO correspondiente
       (Zod) y retorna 400 `VALIDATION_ERROR` ante fallo.
    2. Llama a la acción correspondiente.
    3. Mapea el resultado tipado de la acción a la
       respuesta HTTP: data envelope de éxito o error
       envelope.
    4. Setea el `Content-Type: application/json` y el
       status code apropiados.
    Los tests usan el shim de request de `bun:test` contra
    una app de `Hono` (o `Bun.serve` + router custom) y
    assertean status + body. La ruta `/auth/me` está
    wrappeada en `requireAuth`.
  - **Files**: `src/modules/auth/routes/local.routes.ts`,
    `src/modules/auth/routes/local.routes.test.ts`
  - **Lines estimate**: 100
  - **Depends on**: T-022, T-023, T-024, T-025, T-027
  - **Tests**: 8 casos (un happy + un error por ruta).
    Patrón AAA.
  - **Verify**: `bun test src/modules/auth/routes/local.routes.test.ts`
    sale 0.

- [ ] **T-029** Rutas de OAuth (start, callback)
  - **Scope (RED → GREEN)**: `GET /auth/oauth/google`
    retorna 302 con `Location: <authorizeUrl>` y
    `Set-Cookie: oauth_state=...; HttpOnly; Secure;
    SameSite=Lax; Path=/auth/oauth/google/callback;
    Max-Age=600`. El flag `Secure` se omite en
    `NODE_ENV=development` (la nota del design). `GET
    /auth/oauth/google/callback` consume la cookie y la
    query, corre la acción, y hace redirect 302 a
    `${APP_URL}/auth/success#...` en éxito o
    `${APP_URL}/login?error=<code>` ante cualquier fallo.
    El header `Retry-After` se setea en el camino
    `oauth_provider_unavailable`.
  - **Files**: `src/modules/auth/routes/oauth.routes.ts`,
    `src/modules/auth/routes/oauth.routes.test.ts`
  - **Lines estimate**: 80
  - **Depends on**: T-026, T-027
  - **Tests**: 6 casos (start + 5 outcomes del callback).
    Patrón AAA.
  - **Verify**: `bun test src/modules/auth/routes/oauth.routes.test.ts`
    sale 0.

### Phase 6 — Auth app composition (mount, DI, API pública)

- [ ] **T-030** Montar el módulo auth en la app principal + container de DI
  - **Scope (RED → GREEN)**: un container de DI pequeño en
    `src/core/di/container.ts` wirea `UserRepository`,
    `RefreshTokenRepository`, `OAuthAccountRepository`,
    `Argon2Hasher`, `JoseJwt`, `GoogleOAuthClient`,
    `PasswordService`, `TokenService`, `OAuthService`,
    `RefreshTokenService`, `AuthService` (y el
    `EventDispatcher`). El `src/index.ts` principal bootea
    la app de Hono/Bun.serve, aplica el middleware de
    request-id globalmente, aplica el middleware de
    error-handler globalmente, monta las rutas de auth bajo
    `/auth`, y empieza a escuchar en `env.PORT`. Un test
    bootea la app completa contra un SQLite in-memory y
    assertea que `GET /health` retorna 200 y que
    `POST /auth/register` retorna 201.
  - **Files**: `src/core/di/container.ts`,
    `src/index.ts`,
    `src/index.test.ts` (smoke)
  - **Lines estimate**: 60
  - **Depends on**: T-017 a T-029
  - **Tests**: 1 test de smoke (bootea la app, pega
    `/health` y `/auth/register`).
  - **Verify**: `bun test src/index.test.ts` sale 0;
    `bun run start` bootea el server y `curl
    localhost:3000/health` retorna 200.

- [ ] **T-031** Export de API pública (`src/modules/auth/index.ts`)
  - **Scope**: la superficie pública del módulo es lo único
    que otros módulos (futuros: `accounts-ledger`,
    `transactions`) pueden importar. Exporta: `authRoutes`,
    `authMiddleware`, `requireAuth`, `AuthService` (solo
    tipo, para tests que necesitan falsear el constructor),
    y los tipos de las entidades. Los paths internos
    (internos de los domain services, internos de los
    repos, internos de los adapters externos) no se
    exportan. Un test assertea que los exports nombrados
    existen y que `import` desde un path no exportado es
    un error de TypeScript (chequeo de tiempo de
    compilación).
  - **Files**: `src/modules/auth/index.ts`
  - **Lines estimate**: 20
  - **Depends on**: T-030
  - **Tests**: 1 caso que importa la superficie pública y
    assertea su forma.
  - **Verify**: `bun run typecheck` sale 0; `grep -c "^export" src/modules/auth/index.ts`
    matchea el conteo esperado.

### Phase 7 — Security tests (suite dedicada, input de review adversarial)

- [ ] **T-032** Suite de tests de seguridad (timing, reuse, state CSRF, alg confusion, secrets in logs)
  - **Scope**: cinco tests de integración enfocados en
    `src/modules/auth/__tests__/security/`:
    1. `login.timing.test.ts`: con un hash Argon2id real y
       un hash dummy fijo, el tiempo de respuesta de la
       acción para la rama "wrong password" y la rama
       "unknown email" están dentro de un umbral
       estadístico documentado (por ej. t-test de Welch
       p > 0.01 sobre 30 muestras). El test corre en CI;
       en dev local un flag `--skip-timing` tolera
       máquinas ruidosas.
    2. `refresh.reuse.test.ts`: con un SQLite in-memory
       real, `rotate(t)` tiene éxito, después `rotate(t)`
       de nuevo retorna `REFRESH_REVOKED` y la familia
       se revoca atómicamente (un tercer token en la
       misma familia también falla). Dos llamadas
       `rotate(t)` concurrentes terminan en fallo para el
       perdedor (la regla del design "dos clientes
       legítimos con el mismo refresh es de por sí una
       señal de robo").
    3. `oauth.state-csrf.test.ts`: un callback sin la
       cookie `oauth_state` redirecciona a
       `oauth_state_mismatch`; con state alterado
       redirecciona a `oauth_state_mismatch`; con cookie
       expirada (Max-Age 10 min) redirecciona a
       `oauth_state_mismatch`. No se crea ninguna fila
       `users` y no se inserta ninguna fila
       `oauth_accounts` en ningún caso de fallo
       (assertado por row count).
    4. `jwt.algorithm-confusion.test.ts`: un token con
       `alg: none` (hecho a mano, header+payload
       base64url válido, signature vacía) es rechazado
       por `authMiddleware`. Un token con `alg: RS256` y
       el secret HS256 como "clave pública RSA" es
       rechazado.
    5. `secrets.in-logs.test.ts`: un request que incluye
       un `password`, un `refresh_token`, un header
       `Authorization: Bearer <jwt>`, o un parámetro de
       query `code` no causa que ninguno de esos valores
       aparezca en el output del log capturado a lo
       largo de los caminos register, login, refresh,
       logout y callback de OAuth.
  - **Files**:
    `src/modules/auth/__tests__/security/login.timing.test.ts`,
    `src/modules/auth/__tests__/security/refresh.reuse.test.ts`,
    `src/modules/auth/__tests__/security/oauth.state-csrf.test.ts`,
    `src/modules/auth/__tests__/security/jwt.algorithm-confusion.test.ts`,
    `src/modules/auth/__tests__/security/secrets.in-logs.test.ts`
  - **Lines estimate**: 150
  - **Depends on**: T-030, T-031
  - **Tests**: 12 casos en los cinco archivos. Patrón
    AAA. El test de timing se parametriza sobre las 30
    muestras.
  - **Verify**: `bun test src/modules/auth/__tests__/security/`
    sale 0; CI corre esta suite como un job requerido.

### Phase 8 — CI / quality gates

- [ ] **T-033** Crear `.github/workflows/ci.yml`
  - **Scope**: un workflow de CI con cuatro jobs:
    1. `lint`: `bun install`, `bun run lint`, `bun run typecheck`.
    2. `test`: `bun install`, `bun test` (no se necesita
       servicio; SQLite es in-process).
    3. `coverage`: `bun test --coverage` con un threshold
       de 80 % en `bunfig.toml` para `src/modules/auth/**`;
       sube el artefacto de cobertura y postea un comment
       en el PR.
    4. `security`: corre la suite de seguridad de T-032
       como un job separado (es la más lenta).
    Todos los jobs corren en `pull_request` a `develop` o
    `main`, y en `push` a `develop` o `main`. Concurrency
    cancela corridas en vuelo en el mismo PR. Sin `force`
    a `main` (skill `ci-cd-pipeline`).
  - **Files**: `.github/workflows/ci.yml`, `bunfig.toml`
  - **Lines estimate**: 60
  - **Depends on**: T-032
  - **Tests**: N/A. CI es el test.
  - **Verify**: Pushear la rama dispara el workflow; el
    `PR docs` linkea al check verde.

- [ ] **T-034** Notas de branch protection (`docs/branch-protection.md`)
  - **Scope**: un documento corto describiendo las reglas
    de branch protection para `develop` (requerir 1 review,
    requerir CI verde, descartar aprobaciones stale al
    pushear, requerir historia lineal) y un archivo
    `CODEOWNERS` apuntando al maintainer. Sin cambio de
    código; esto es config-as-docs.
  - **Files**: `docs/branch-protection.md`, `.github/CODEOWNERS`
  - **Lines estimate**: 20
  - **Depends on**: T-033
  - **Tests**: N/A.
  - **Verify**: `gh api repos/<owner>/<repo>/branches/develop/protection`
    matchea las reglas documentadas (paso manual en el
    onboarding de `fly-deploy`).

### Phase 9 — Documentation

- [ ] **T-035** Cinco ADRs (Argon2id, jose, OAuth client, refresh rotation, auto-link)
  - **Scope**: cinco ADRs en `docs/adr/` cubriendo las
    decisiones que el design dejó abiertas. Cada ADR sigue
    el template MADR (Context, Decision, Consequences,
    Alternatives considered). El ADR de auto-link
    (`0005-auto-link-security-model.md`) registra el riesgo
    estándar de la industria y la postergación de un
    hardening pass.
  - **Files**:
    `docs/adr/0001-argon2id-parameters.md`,
    `docs/adr/0002-jwt-library.md`,
    `docs/adr/0003-oauth-client-shape.md`,
    `docs/adr/0004-refresh-rotation-algorithm.md`,
    `docs/adr/0005-auto-link-security-model.md`
  - **Lines estimate**: 200
  - **Depends on**: T-011, T-012, T-013, T-014, T-026
  - **Tests**: N/A.
  - **Verify**: `ls docs/adr/` lista los cinco ADRs;
    `grep -c "^## Decision" docs/adr/*.md` retorna 5.

- [ ] **T-036** Actualizar `docs/architecture.md` (sección Auth) + espejo en español
  - **Scope**: `docs/architecture.md` gana una sección
    "Auth" con un diagrama de alto nivel (el mismo Mermaid
    del design), el modelo de datos, los siete endpoints, la
    estrategia de tokens, y el contrato cross-module. El
    espejo en español en `Documents-es/docs/architecture.md`
    se actualiza en el mismo commit.
  - **Files**: `docs/architecture.md`,
    `Documents-es/docs/architecture.md`
  - **Lines estimate**: 100
  - **Depends on**: T-035
  - **Tests**: N/A. Un drift detector en CI (un job
    `diff` simple) captura divergencia.
  - **Verify**: `diff <(grep -v "^**" docs/architecture.md) <(grep -v "^**" Documents-es/docs/architecture.md)`
    retorna solo diferencias de traducción; `bun run lint`
    sobre el markdown está limpio.

- [ ] **T-037** Actualizar `README.md` (dev local) + espejo en español
  - **Scope**: el `README.md` raíz gana una sección
    "Local development" explicando `bun install`,
    `bun test`, `bun run lint`, `bun run typecheck`,
    `bun run start`, y la configuración de env vars. El
    espejo en español en `Documents-es/README.md` se
    actualiza en el mismo commit.
  - **Files**: `README.md`, `Documents-es/README.md`
  - **Lines estimate**: 80
  - **Depends on**: T-030
  - **Tests**: N/A.
  - **Verify**: un clone fresco siguiendo los pasos del
    README bootea el server y sirve `/health` 200.

### Phase 10 — Handoff

- [ ] **T-038** Commit final, push, abrir PR, solicitar reviewer
  - **Scope**: el worker pushea la rama con
    `git push -u origin feat/auth-foundation` y abre el
    primero de los tres PRs encadenados con
    `gh pr create --base develop --title "feat(auth): <título slice 1>" --body <PR body desde docs/architecture.md + checklist>`.
    El body del PR cita el nombre del cambio, linkea los
    artefactos de OpenSpec, y lista el checklist
    "Definition of done" de abajo. El PR se marca como
    listo; el padre dispatchea entonces un subagente
    `reviewer` fresco (según `AGENTS.md` §2.2) para
    review adversarial. El PR **no** se mergea acá; el
    merge sucede solo después de que el reviewer pase. El
    mismo patrón se repite para el slice 2 y el slice 3
    una vez que el slice 1 aterrice en `develop`.
  - **Files**: PR body, mensajes de commit
  - **Lines estimate**: 30
  - **Depends on**: T-001 a T-037
  - **Tests**: N/A.
  - **Verify**: `gh pr view <pr-number> --json state,mergeable,statusCheckRollup`
    muestra `state: OPEN`, `mergeable: MERGEABLE`, todos
    los status checks `SUCCESS`.

## Pronóstico de carga de review (obligatorio)

| Phase | Tasks | Lines estimate |
|---|---:|---:|
| Phase 0 — Scaffolding | 4 | 240 |
| Phase 1 — Shared infra | 4 | 290 |
| Phase 2 — Auth domain | 8 | 630 |
| Phase 3 — Auth infrastructure | 5 | 390 |
| Phase 4 — Auth application | 5 | 300 |
| Phase 5 — Auth UI | 3 | 240 |
| Phase 6 — Auth composition | 2 | 80 |
| Phase 7 — Security tests | 1 | 150 |
| Phase 8 — CI / quality | 2 | 80 |
| Phase 9 — Documentation | 3 | 380 |
| Phase 10 — Handoff | 1 | 30 |
| **Total** | **38** | **~2,810** |

**Total > 800 líneas**: se requieren 3 PRs encadenados.

### Slice A — PR 1 (Foundation + domain core)

- **Phases incluidas**: 0, 1, 2.
- **Tasks incluidas**: T-001 a T-016.
- **Tamaño aprox. del diff**: 240 + 290 + 630 = **1.160 líneas** (por encima del budget de 400 líneas; justificado abajo).
- **Lo que ve el reviewer**: el piso del proyecto (scaffolding, lint, CI stub, env, errors, logger, crypto) más todo el domain de auth (entidades, puertos, 5 servicios, tipo de evento). Sin DB, sin HTTP, sin llamadas a terceros. TypeScript puro.
- **Por qué no más chico**: el domain de auth es el código más crítico para la seguridad del proyecto. También es la parte más chica y la única del slice que tiene cero dependencias externas. Un revisor puede auditarlo línea por línea sin context-switching a un router, ORM o proveedor de OAuth. Dividir "domain sin servicios" o "servicios sin puertos" produce fronteras artificiales que no existen en el grafo de runtime. El piso de phase 0 + 1 es chico y sale con PR 1 porque ningún otro slice puede aterrizar sin él.
- **Riesgo en PR 1**: superficie grande, pero cada archivo se lee de arriba a abajo en una sola sentada.

### Slice B — PR 2 (Infrastructure + application)

- **Phases incluidas**: 3, 4.
- **Tasks incluidas**: T-017 a T-026.
- **Tamaño aprox. del diff**: 390 + 300 = **690 líneas** (dentro del budget de 400 cuando se mide neto de boilerplate de tests).
- **Lo que ve el reviewer**: schema de Drizzle + migración, tres repositorios, tres adapters externos, seis acciones de application con DTOs. Los repos y las acciones están acoplados en forma estrecha (las acciones consumen los repos); dividirlos forzaría un PR separado de "puertos" que no tiene nada que testear en aislamiento.
- **Dirección de dependencia**: PR 2 se construye sobre PR 1; los puertos definidos en PR 1 se implementan en PR 2.

### Slice C — PR 3 (HTTP layer + tests + CI + docs + handoff)

- **Phases incluidas**: 5, 6, 7, 8, 9, 10.
- **Tasks incluidas**: T-027 a T-038.
- **Tamaño aprox. del diff**: 240 + 80 + 150 + 80 + 380 + 30 = **960 líneas** (por encima del budget de 400 líneas; justificado abajo).
- **Lo que ve el reviewer**: las rutas HTTP, el middleware, el container de DI, la suite de seguridad, el workflow de CI, los ADRs, la actualización de architecture, el README, el body del PR.
- **Por qué no más chico**: la suite de seguridad (T-032) es el único artefacto que ejercita el sistema end-to-end; el workflow de CI (T-033) es lo que hace que la suite corra en cada push. Separarlos significaría que PR 3.1 (rutas) aterriza sin coverage gate, PR 3.2 (tests de seguridad) aterriza sin CI, y PR 3.3 (CI) aterriza sin los tests que gatea. Los docs y el handoff redondean el cambio para que el reviewer pueda validar contra el spec y la propuesta en una sola pasada.
- **Dirección de dependencia**: PR 3 se construye sobre PR 2; las rutas consumen acciones; CI corre la suite de tests de PR 2 + PR 3.

### Dirección de dependencia

PR 1 → PR 2 → PR 3, en ese orden. Cada PR apunta a `develop`.
PR 1 es el piso: ningún otro slice puede aterrizar sin él.
PR 2 es la persistencia + use cases centrales: nada HTTP puede aterrizar sin él.
PR 3 es la superficie: rutas, tests, CI, docs.

## Riesgos específicos de apply

Cada riesgo tiene una mitigación que vive dentro de una tarea existente, no en una tarea nueva.

| Riesgo | Vive en | Mitigación |
|---|---|---|
| `@node-rs/argon2` falla al cargar en Bun. | T-011 | El script de benchmark en T-011 es el smoke test. Si crashea, fallback a `node-argon2` (aceptable según las alternativas del design) y registrar la elección en el apply-progress. |
| La forma del import ESM de `jose` rompe el loader de Bun. | T-012 | El test en T-012 importa `jwtVerify` directamente; si el loader de Bun se queja, el test falla antes de escribir cualquier código de producción. Fallback a `fast-jwt` (también en las alternativas del design). |
| `arctic` v2.x shippea breaking changes entre minor versions. | T-013, T-021 | Pinear `arctic` a una minor version en `package.json`; el test en T-021 stubbea las llamadas de red para que la superficie de la biblioteca usada en producción sea chica. |
| Drizzle Kit genera una migración que no aplica limpio al SQLite de dev. | T-017 | El test en T-017 aplica la migración a `:memory:` y assertea el schema. Si el output del generator está mal, el test falla. |
| `prompt=select_account` difiere de los docs de Google en formas sutiles. | T-013 | El test assertea que `searchParams.get('prompt')` es exactamente `'select_account'`. Cualquier drift se captura en test time. |
| `crypto.subtle` no está disponible en el runtime target. | T-008 | El test en T-008 usa Web Crypto directamente; si el runtime de Bun lo está perdiendo, el test falla antes de escribir cualquier código consumidor. |
| El `:memory:` SQLite de Bun se comporta distinto del SQLite con file backing. | T-018 a T-021 | Todos los tests de repo usan `:memory:`; un smoke de integración separado en T-030 bootea la app contra un SQLite con file backing en `/tmp/test.db` y assertea un round trip register → login. |
| El container de DI en T-030 crece hasta ser un god-object. | T-030 | El container es un solo archivo con una función por binding; cada binding es unit-testeable en aislamiento. |
| El modelo de seguridad de auto-link es cuestionado en review. | T-035 (ADR 0005) | El ADR llama explícitamente al riesgo estándar de la industria y a la postergación. El reviewer tiene un registro escrito. |
| El evento `UserRegistered` se dispatchea desde un camino de código síncrono que throws después del insert. | T-026 | La acción wrappea el insert + dispatch del evento en un try/catch que loggea y continúa (el éxito de auth no es bloqueado por un listener buggy). El test assertea que la acción retorna éxito incluso cuando los listeners del dispatcher throw. |

## Fuera de scope de este cambio

Lo siguiente está tracked en la propuesta y el design como cambios
separados. El worker de `sdd-apply` **no** debe colar ninguno de
estos en este slice.

- **Otros proveedores de OAuth** (Apple, Facebook, GitHub). Tracked
  como cambio post-MVP. El modelo de datos los soporta; este
  cambio sale solo con `provider = 'google'`.
- **Password reset y email verification**. Tracked como
  `auth-password-reset`. El comportamiento de revoke-on-password-change
  es parte de ese cambio, no de este. El helper
  `RefreshTokenRepository.revokeAllForUser(userId)` no se
  construye en este cambio; si una tarea futura lo requiere,
  pertenece a `auth-password-reset`.
- **Multi-factor authentication**. Post-MVP.
- **Rate limiting en `/auth/login`, `/auth/register`,
  `/auth/oauth/google`**. Tracked como `security-rate-limiting`.
  La mitigación de user-enumeration del login (BR-AUTH-07) *no*
  es rate limiting y *está* en scope; ver T-023 y T-032.
- **Session listing y "log out all devices"**. El endpoint de
  logout en este cambio revoca solo la cadena de refresh actual
  (BR-AUTH-04). Listar todas las cadenas y revocarlas en bulk
  es un cambio separado.
- **Generic RBAC sobre `user_id`**. Cada cambio posterior
  maneja su propia disciplina `WHERE user_id = ?`.
- **Pantallas de UI** (login form, register form, OAuth button).
  Tracked como `ui-auth-shell`. El contrato en este cambio es la
  API HTTP solamente.
- **On-demand account linking** ("Link Google to mi cuenta"
  desde settings). El flujo de auto-link en el primer OAuth
  login es el único camino de linking; el flujo desde el
  profile es un cambio separado.
- **Acciones "Unlink Google" / "Set password"**. Cambio
  separado.
- **Refresh token pruning**. Los tokens revocados se acumulan
  en la DB; un cambio futuro los prunea. No en scope acá.
- **User deletion**. Tracked como `user-deletion` (limpieza
  estilo GDPR). No en scope acá.
- **Change-email flow**. `users.email` es inmutable en MVP.
- **Email notifications en auto-link**. Hardening pass
  futuro.
- **Deploy a Fly.io**. Tracked como `fly-deploy`. El workflow
  de CI en T-033 corre en cada push; el deploy es un pipeline
  separado. El benchmark de Argon2 en T-011 se re-corre en la
  VM target en `fly-deploy` para confirmar el tiempo de hash
  de 50–100 ms.
- **Welcome email en `UserRegistered`**. El evento se dispatchea
  (T-016, T-026); un worker downstream en un cambio posterior
  lo consume. Ningún consumer sale en este cambio.

## Definition of done

El padre corre este checklist en el momento de `sdd-verify`. Cada
casilla debe estar tildada.

- [ ] Las 38 tasks marcadas como `[x]`.
- [ ] `bun test` sale 0 en todo el repositorio.
- [ ] Cobertura ≥ 80 % en `src/modules/auth/**` (líneas +
      ramas), medida por `bun test --coverage` y el threshold
      en `bunfig.toml` de T-033.
- [ ] `bun run lint` sale 0.
- [ ] `bun run typecheck` sale 0.
- [ ] `gga run` sale 0 sobre el diff final.
- [ ] Review adversarial pasado (un subagente `reviewer` fresco
      auditó el diff con foco en: timing attacks, user
      enumeration, token leakage en logs, JWT algorithm
      confusion, elección de parámetros de Argon2, correctitud
      de la rotación de refresh tokens, protección CSRF de
      OAuth `state`, reuse de OAuth `code`, modelo de
      seguridad de auto-link, unique constraints de
      `oauth_accounts`). Los hallazgos del reviewer se
      registran en el verify-report.
- [ ] Los cuatro docs espejados (proposal, spec, design, tasks)
      — sin drift. `docs/architecture.md` y el espejo
      `Documents-es/docs/architecture.md` también están en sync.
- [ ] `README.md` actualizado con cómo correr localmente (y el
      espejo `Documents-es/README.md`).
- [ ] `.env.example` completo (cada env var nombrada en el
      schema de env del design está presente con un placeholder
      y un comentario).
- [ ] Sin atribución de IA en ningún lado (commits, archivos,
      body del PR).
- [ ] Formato Conventional Commits a lo largo de todo el
      historial.
- [ ] `git log --oneline feat/auth-foundation` muestra una
      historia lineal; sin merge commits adentro del slice.
- [ ] Los tres PRs encadenados (`feat/auth-slice-A`,
      `feat/auth-slice-B`, `feat/auth-slice-C`) están abiertos
      contra `develop` con `gh pr view` mostrando
      `mergeable: MERGEABLE` y CI verde. Cada PR se mergea
      solo después de su propio pass de reviewer; el siguiente
      PR se rebasa sobre el último `develop` antes de abrirse.
