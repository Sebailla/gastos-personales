# Tareas — `auth-foundation`

**Autor**: Sebastián Illa
**Cambio**: `auth-foundation`
**Estado**: listo-para-aplicar · **Creado**: 2026-06-10
**Ascendente**: `openspec/changes/auth-foundation/proposal.md` (v2, aprobado) ·
`openspec/changes/auth-foundation/design.md` (v2, aprobado) ·
`openspec/specs/auth/spec.md` (canónico, v2)
**Rama destino**: `feat/auth-foundation` → `develop`
**Estrategia de PR**: 3 PRs encadenados (ver "Pronóstico de carga de revisión" abajo)
**Valores de preflight**: interactivo · `both` (OpenSpec + Engram) · `auto-forecast` · presupuesto de 400 líneas
**Stack v2**: Next.js 16 + Node 20 + catch-all de Hono + Auth.js v5 (`next-auth@5.0.0-beta.X`, versión exacta) + `@auth/prisma-adapter` + Prisma 6 + PostgreSQL en Neon + Zod + Vitest + pnpm + Fly.io

> **Nota v2**: esta es la segunda escritura de esta lista de
> tareas. La primera versión apuntaba a Bun + Hono (servidor) +
> Drizzle + SQLite + un subsistema de auth hecho a mano (commit
> `b2a69ec`) y se eliminó en `eca35c9` después de que cambió el
> stack. La v1 se conserva en el historial de git como
> referencia estructural; su contenido es **obsoleto** (JWT
> propio, rotación de refresh, Drizzle, SQLite, `arctic`, `jose`,
> `bun-argon2`). La v2 mantiene la *forma* de la v1 (11 fases,
> orden TDD-first, pronóstico de 3 PRs encadenados) y reemplaza la
> *sustancia* con sesiones de base de datos de Auth.js v5, el
> adapter de Prisma y el catch-all de Hono que aloja la API de
> aplicación.

## Objetivo

`auth-foundation` aterriza una capa de identidad completa y
lista para producción para `gastos-personales`. Cuando termine
`sdd-apply`, el sistema debe exponer siete rutas gestionadas
por Auth.js bajo `/api/auth/*` (sign-in, inicio de OAuth,
callback de OAuth, callback de credenciales, session, CSRF,
providers, sign-out) más tres rutas de aplicación montadas
con Hono bajo `/api/*` (`/health`, `/me`, `/auth/register`),
respaldadas por cuatro tablas Postgres gestionadas por Prisma
(`User`, `Account`, `Session`, `VerificationToken`) en Neon,
con hashing de contraseñas Argon2id (parámetros ajustados para
50–100 ms en 1 CPU de Fly.io), OAuth 2.0 de Google con
auto-link por coincidencia de email, un helper server-side
`auth()` que sea la única ruta de resolución de identidad,
logging estructurado que filtra `password` / `passwordHash` /
`sessionToken` / `access_token` / `refresh_token` / `id_token`
/ `csrfToken` / `"set-cookie"` de cada línea (BR-AUTH-11), y
cobertura ≥ 80 % en líneas y ramas en `src/modules/auth/**` y
`src/shared/db/**` — todo bloqueado por `pnpm test` (Vitest),
`pnpm run lint`, `pnpm run typecheck`, `pnpm run build` y
`gga run`.

## Resumen de alcance

- 4 modelos de Prisma (User, Account, Session,
  VerificationToken) + 1 migración versionada (SQL
  generado por Prisma).
- 3 tipos de entidades de dominio (User, Account, Session
  como proyecciones) + value object PublicUser.
- 3 clases de servicio de dominio (PasswordService,
  AuthService, DefaultProviderPolicy) y la configuración de
  Auth.js en el borde de infraestructura.
- 1 paquete de aplicación: action de register + DTO; action
  de me + DTO; action de health.
- 3 rutas Hono montadas en
  `app/api/[...path]/route.ts`: `GET /health`, `GET /me`,
  `POST /auth/register`.
- 7 rutas gestionadas por Auth.js bajo `/api/auth/*`,
  montadas en `app/api/auth/[...nextauth]/route.ts`.
- 1 middleware (origin-check) para endpoints Hono que
  mutan estado.
- 1 exportación de cliente tipado
  (`hc<typeof honoApp>`) en `src/modules/api/client.ts`.
- 2 tipos de evento (`UserRegistered`, `UserSignedIn`) +
  integración con el dispatcher.
- 6 tests de seguridad (timing, OAuth `state`, secretos en
  logs, origin-check, parámetros Argon2id, atributos de
  cookie).
- 5 ADRs (Auth.js v5, Prisma 6, parámetros Argon2id, forma
  del catch-all de Hono, modelo de seguridad del auto-link).
- Workflow de CI (`.github/workflows/ci.yml`) con jobs de
  lint + typecheck + test (coverage) + build.
- Husky pre-commit (`gga run` + lint-staged) + commit-msg
  (commitlint) + pre-push.
- ESLint + Prettier + TypeScript strict + cobertura de
  Vitest ≥ 80 % en `src/modules/auth/**` y
  `src/shared/db/**`.
- Docs bilingües: esta lista de tareas +
  `docs/architecture.md` (sección Auth) + `README.md`,
  todos reflejados en `Documents-es/`.

## Mapa de arquitectura (forma final tras `sdd-apply`)

```
gastos-personales/
├── app/
│   ├── api/auth/[...nextauth]/route.ts   # Handler de Auth.js
│   ├── api/[...path]/route.ts            # Catch-all de Hono
│   ├── auth/
│   │   ├── signin/page.tsx               # página signIn custom
│   │   └── signout/page.tsx              # página signOut custom
│   ├── layout.tsx
│   └── page.tsx
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│       └── 20260610000000_auth_foundation/migration.sql
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── domain/
│   │   │   │   ├── entities/{user,account,session}.ts
│   │   │   │   ├── value-objects/public-user.ts
│   │   │   │   ├── services/{password,default-provider,auth}.service.ts
│   │   │   │   └── interfaces/{user,account,session}.repository.port.ts
│   │   │   ├── application/
│   │   │   │   ├── actions/{register,me,health}.action.ts
│   │   │   │   └── dto/{register,me,health}.dto.ts
│   │   │   ├── infrastructure/
│   │   │   │   ├── external/
│   │   │   │   │   ├── argon2.hasher.ts
│   │   │   │   │   └── authjs.ts
│   │   │   │   └── repositories/
│   │   │   │       ├── user.repository.ts
│   │   │   │       ├── account.repository.ts
│   │   │   │       └── session.repository.ts
│   │   │   ├── __tests__/security/
│   │   │   │   ├── login.timing.test.ts
│   │   │   │   ├── oauth.state-csrf.test.ts
│   │   │   │   ├── secrets.in-logs.test.ts
│   │   │   │   ├── origin-check.test.ts
│   │   │   │   ├── argon2.parameters.test.ts
│   │   │   │   └── cookie.attributes.test.ts
│   │   │   └── index.ts                 # API pública
│   │   └── api/
│   │       ├── app.ts                   # app OpenAPIHono
│   │       ├── client.ts                # hc<typeof honoApp> tipado
│   │       ├── middlewares/origin-check.ts
│   │       └── index.ts
│   └── shared/
│       ├── env/
│       │   ├── env.schema.ts
│       │   └── env.schema.test.ts
│       ├── errors/
│       │   ├── app-error.ts
│       │   ├── app-error.test.ts
│       │   └── error-codes.ts
│       ├── logger/
│       │   ├── logger.ts
│       │   └── logger.test.ts
│       ├── events/
│       │   ├── event-dispatcher.ts
│       │   ├── event-dispatcher.test.ts
│       │   └── user-events.ts
│       ├── http/
│       │   ├── request-id.ts
│       │   ├── request-id.test.ts
│       │   ├── error-handler.ts
│       │   └── error-handler.test.ts
│       ├── crypto/
│       │   ├── web-crypto.ts
│       │   └── web-crypto.test.ts
│       └── db/
│           ├── prisma.ts                # singleton de PrismaClient
│           └── prisma.test.ts
├── docs/
│   ├── adr/
│   │   ├── 0001-authjs-v5.md
│   │   ├── 0002-prisma-6.md
│   │   ├── 0003-argon2id-parameters.md
│   │   ├── 0004-hono-catch-all.md
│   │   └── 0005-auto-link-security-model.md
│   └── architecture.md                   # gana la sección "Auth"
├── scripts/
│   └── bench-argon2.ts                   # mide tiempo de hash
├── test/
│   └── setup.ts                          # setup de vitest
├── .github/
│   ├── workflows/ci.yml
│   └── CODEOWNERS
├── .husky/
│   ├── commit-msg
│   ├── pre-commit
│   └── pre-push
├── .gga
├── .env.example
├── commitlint.config.js
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── prisma.config.ts
├── vitest.config.ts
├── AGENTS.md
├── openspec/
└── Documents-es/
    └── (reflejos de cada doc en inglés arriba, mismo path)
```

`src/modules/auth/index.ts` exporta la superficie pública:
`auth()` (el helper server-side de Auth.js v5), `signIn`,
`signOut`, `handlers` (el re-export de `GET`/`POST` para
`/api/auth/*`), `honoApp` (la instancia `OpenAPIHono` para
el catch-all de Hono), y las constantes con los nombres de
evento `UserRegistered` y `UserSignedIn`. Nada más en el
codebase alcanza los internos del módulo.

## Lista de tareas

> **Disciplina TDD.** Cada tarea es un par: el archivo de
> test se escribe y commitea **primero** (RED), después se
> escribe la implementación para hacerlo pasar (GREEN), y
> luego cualquier cleanup obvio se incorpora (REFACTOR). Las
> líneas `Tests` y `Verify` abajo detallan esto por tarea. Por
> `openspec/config.yaml` (actualizado en el mismo commit que
> esta lista de tareas) `strictTdd.enabled: true` y
> `strictTdd.runner: "pnpm test"` (Vitest). El runner **nunca**
> es `bun test`.

### Fase 0 — Scaffolding (el piso sobre el que se sostiene todo)

- [x] **T-001** Inicializar el proyecto Next.js 16 + TypeScript + pnpm
  - **Alcance**: `pnpm create next-app@latest gastos-personales --ts
    --eslint --app --src-dir --import-alias "@/*" --no-tailwind
    --use-pnpm` para hacer scaffold del piso. Verificar
    `next.config.ts`, `tsconfig.json` (strict: true) y el árbol
    `app/` por defecto. Agregar los scripts `dev`, `build`,
    `start`, `lint`, `typecheck`, `test`, `test:coverage`,
    `test:ui` y `prisma` a `package.json`. Agregar
    `"packageManager": "pnpm@<version>"` para que el
    `corepack enable` de CI aprovisione la versión correcta.
    Sin código de auth todavía.
  - **Archivos**: `package.json`, `tsconfig.json`,
    `next.config.ts`, `app/layout.tsx`, `app/page.tsx`
  - **Estimación de líneas**: 80
  - **Depende de**: ninguna
  - **Tests**: N/A (scaffolding). `pnpm test` corre Vitest sin
    tests y sale 0.
  - **Verificar**: `pnpm install` sale 0; `pnpm test` sale 0
    ("no tests found", no es un error); `pnpm run typecheck`
    sale 0; `pnpm run build` sale 0 (smoke test del build de
    producción de Next.js).

- [x] **T-002** Configurar ESLint, Prettier, `.editorconfig`, Vitest
  - **Alcance**: ESLint con `@typescript-eslint` recomendado +
    `eslint-config-prettier` para desactivar reglas en
    conflicto; Prettier por defecto (comillas simples, sin
    punto y coma, trailing comma `all`); `.editorconfig` para
    indent + charset. Agregar un `vitest.config.ts` en la raíz
    del proyecto con el provider de cobertura v8 y el umbral
    de 80 % en líneas y ramas para `src/modules/auth/**` y
    `src/shared/db/**`. Cablear el alias de path `@` en
    `vitest.config.ts` para que los tests resuelvan imports
    igual que la app.
  - **Archivos**: `.eslintrc.cjs`, `.prettierrc`,
    `.editorconfig`, `vitest.config.ts`, `test/setup.ts`
  - **Estimación de líneas**: 70
  - **Depende de**: T-001
  - **Tests**: N/A. La config de lint y Vitest son gates, no
    comportamiento unit-tested.
  - **Verificar**: `pnpm run lint` sale 0 en el
    `app/page.tsx` del scaffold; `pnpm test` sale 0 sin tests.

- [x] **T-003** Instalar Husky + commitlint + lint-staged + cablear GGA pre-commit
  - **Alcance**: `pnpm dlx husky init` crea `.husky/`. El hook
    `commit-msg` corre `pnpm dlx commitlint --edit "$1"`. El
    hook `pre-commit` corre `pnpm dlx lint-staged` (que corre
    ESLint + Prettier sobre los archivos staged) y luego
    `gga run` sobre los archivos staged. El hook `pre-push`
    valida el nombre de la rama contra
    `^(feat|fix|chore|docs|refactor|test|build|ci|perf|revert)/[a-z0-9-]+$`
    y rechaza los push a `main` o `master`.
    `commitlint.config.js` extiende
    `@commitlint/config-conventional`. Se agrega un `.gga` en
    la raíz del proyecto (o se verifica la config global
    existente con `gga --version`).
  - **Archivos**: `.husky/commit-msg`, `.husky/pre-commit`,
    `.husky/pre-push`, `commitlint.config.js`, `.gga`
  - **Estimación de líneas**: 70
  - **Depende de**: T-001, T-002
  - **Tests**: Un `scripts/verify-hooks.sh` smoke-testea cada
    hook con un mensaje de commit y nombre de rama fixture.
  - **Verificar**: `pnpm commitlint --edit` sale 0 con un
    mensaje válido; `pnpm run lint` sale 0 en un stub
    `app/page.tsx`; un `git commit -m "feat: smoke"`
    dispara el hook pre-commit que sale 0; `git push` desde
    una rama llamada `badbranch` es rechazado por el hook
    pre-push.

- [x] **T-004** Crear `.env.example` y extender `.gitignore`
  - **Alcance**: `.env.example` lista cada variable de entorno
    del schema de env del design (`NODE_ENV`, `PORT`,
    `LOG_LEVEL`, `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
    `APP_URL`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
    `ARGON2ID_DUMMY_PASSWORD`, `FLY_REGION`) con placeholders
    vacíos y comentarios de una línea explicando cada uno
    (requerido en producción vs. opcional, dónde obtener el
    valor). Se extiende `.gitignore` para cubrir `.next/`,
    `coverage/`, `pnpm-debug.log*` y `prisma/*.db*`. El
    `.env.example` existente NO se ignora.
  - **Archivos**: `.env.example`, `.gitignore` (modificado)
  - **Estimación de líneas**: 40
  - **Depende de**: T-001
  - **Tests**: N/A. El schema Zod en T-005 es la superficie
    testeable para estos valores.
  - **Verificar**: `git check-ignore -v .env` devuelve 0;
    `git check-ignore -v .env.example` devuelve 1 (NO
    ignorado); `cat .env.example | grep -c AUTH_SECRET`
    devuelve 1; `cat .env.example | grep -c
    ARGON2ID_DUMMY_PASSWORD` devuelve 1.

### Fase 1 — Infraestructura compartida (env, errores, logger, eventos, crypto, http)

- [x] **T-005** Escribir el schema de env con Zod con tests
  - **Alcance (RED → GREEN → REFACTOR)**: los tests para el
    schema de env viven en
    `src/shared/env/env.schema.test.ts`. Cubren: cualquier
    clave requerida faltante ⇒ lanza; `AUTH_SECRET` con
    longitud < 32 ⇒ lanza; `DATABASE_URL` vacío ⇒ lanza;
    `AUTH_URL` no es una URL ⇒ lanza; `PORT` se coercea a
    número; validación enum de `NODE_ENV`; aserción
    cross-field
    `new URL(env.AUTH_URL).origin === new URL(env.APP_URL).origin`
    falla rápido. Una vez los tests están en rojo, implementar
    el schema en `src/shared/env/env.schema.ts` y re-correr
    hasta verde.
  - **Archivos**: `src/shared/env/env.schema.test.ts`,
    `src/shared/env/env.schema.ts`
  - **Estimación de líneas**: 90
  - **Depende de**: T-001
  - **Tests**: 7 casos. Patrón AAA. Parametrizado vía
    `it.each` table-driven. Sin `if/else/for` en los bodies
    de los tests.
  - **Verificar**: `pnpm test src/shared/env/` sale 0;
    `pnpm test` global sigue saliendo 0; `pnpm run
    typecheck` sale 0.

- [x] **T-006** Escribir la clase `AppError` y las constantes de códigos de error
  - **Alcance (RED → GREEN)**: `src/shared/errors/app-error.test.ts`
    asegura que el constructor de `AppError` guarda `code`,
    `statusCode`, `details`; `instanceof Error` es true;
    `name === 'AppError'`. `src/shared/errors/error-codes.ts`
    exporta el enum exhaustivo de códigos de la sección
    "Códigos de error" del spec (`VALIDATION_ERROR`,
    `WEAK_PASSWORD`, `INVALID_CREDENTIALS`, `UNAUTHORIZED`,
    `EMAIL_TAKEN`, `RATE_LIMITED`, `INTERNAL_ERROR`,
    `FORBIDDEN`, `OAUTH_PROVIDER_UNAVAILABLE`) con sus
    mappings de status HTTP.
  - **Archivos**: `src/shared/errors/app-error.test.ts`,
    `src/shared/errors/app-error.ts`,
    `src/shared/errors/error-codes.ts`
  - **Estimación de líneas**: 70
  - **Depende de**: T-005
  - **Tests**: 4 casos para `AppError`. `error-codes.ts` se
    type-checkea en tiempo de compilación; el test importa
    cada constante y asegura el tipo.
  - **Verificar**: `pnpm test src/shared/errors/` sale 0;
    `pnpm run typecheck` sale 0.

- [x] **T-007** Logger + middleware request-id + middleware error-handler
  - **Alcance (RED → GREEN)**: los tests del logger aseguran
    que las claves de la denylist (`password`, `passwordHash`,
    `sessionToken`, `access_token`, `refresh_token`,
    `id_token`, `csrfToken`, `set-cookie`, `authorization`,
    `cookie`, `code`) se filtran del output del log sin
    importar el objeto de entrada (BR-AUTH-11). Los tests
    del middleware request-id aseguran que un header
    `X-Request-Id` entrante se devuelve, y que un header
    faltante obtiene un uuid v7 fresco. Los tests del
    middleware error-handler de Hono aseguran la forma de
    respuesta `{ error: { code, message, details? } }`
    (según la skill `api-design`), el `requestId` en cada
    línea de log, y que los `details` de `AppError` se
    transmiten mientras que el `Error.message` crudo no.
  - **Archivos**: `src/shared/logger/logger.ts`,
    `src/shared/logger/logger.test.ts`,
    `src/shared/http/request-id.ts`,
    `src/shared/http/request-id.test.ts`,
    `src/shared/http/error-handler.ts`,
    `src/shared/http/error-handler.test.ts`
  - **Estimación de líneas**: 110
  - **Depende de**: T-005, T-006
  - **Tests**: 10 casos a través de los tres módulos. Patrón
    AAA. Parametrizado para la denylist del logger.
  - **Verificar**: `pnpm test src/shared/logger/` `pnpm
    test src/shared/http/` salen 0; cobertura ≥ 80 % en
    `src/shared/logger/logger.ts` y `src/shared/http/`.

- [x] **T-008** Helpers de Web Crypto (uuid v7, sha256 hex, HMAC sign/verify)
  - **Alcance (RED → GREEN)**: `src/shared/crypto/web-crypto.test.ts`
    asegura: `uuidV7()` devuelve un string de 36 caracteres
    con la forma v7 esperada; llamadas consecutivas son
    monótonamente no-decrecientes en el prefijo de
    timestamp; `sha256Hex(input)` es determinista y matchea
    el sha256 Node-compatible de un fixture conocido;
    `hmacSign(key, msg)` y `hmacVerify(key, msg, sig)` son
    simétricos; un mensaje alterado falla la verificación.
    Todas las operaciones usan Web Crypto
    (`crypto.getRandomValues`, `crypto.subtle.digest`,
    `crypto.subtle.sign/verify`). La implementación vive en
    `src/shared/crypto/web-crypto.ts`.
  - **Archivos**: `src/shared/crypto/web-crypto.ts`,
    `src/shared/crypto/web-crypto.test.ts`
  - **Estimación de líneas**: 60
  - **Depende de**: T-005
  - **Tests**: 6 casos. Patrón AAA.
  - **Verificar**: `pnpm test src/shared/crypto/` sale 0;
    `pnpm run typecheck` sale 0.

- [x] **T-009** Dispatcher de eventos in-process + tipos de evento `UserRegistered` / `UserSignedIn`
  - **Alcance (RED → GREEN)**: un registro de eventos
    tipado en `src/shared/events/event-dispatcher.ts` acepta
    una unión de tipos de evento (los eventos `UserRegistered`
    y `UserSignedIn` definidos en la sección "Contratos
    cross-module" del spec). `dispatch({ type, payload })`
    corre los subscriptores registrados; `subscribe(type,
    handler)` registra un subscriptor. El módulo de auth
    publica, los módulos downstream se suscriben. El test
    asegura que `dispatch('UserRegistered', ...)` invoca
    cada subscriptor registrado exactamente una vez; los
    subscriptores que lanzan excepción son capturados,
    logueados a `warn`, y NO bloquean al dispatcher de
    llamar al siguiente subscriptor. No hay subscriptores
    registrados en este cambio.
  - **Archivos**: `src/shared/events/event-dispatcher.ts`,
    `src/shared/events/event-dispatcher.test.ts`,
    `src/shared/events/user-events.ts`
  - **Estimación de líneas**: 50
  - **Depende de**: T-006, T-007
  - **Tests**: 4 casos. Patrón AAA. Parametrizado para el
    camino "subscriptor lanza".
  - **Verificar**: `pnpm test src/shared/events/` sale 0;
    `pnpm run typecheck` sale 0.

### Fase 2 — Dominio de auth (entidades, value objects, ports, servicios)

- [x] **T-010** Entidades de dominio (`User`, `Account`, `Session`) + proyección `PublicUser`
  - **Alcance (RED → GREEN)**: los tests aseguran que las
    factory functions de las entidades normalizan email
    (lowercase + trim) y rechazan input mal formado.
    `PublicUser.from(user)` quita `passwordHash` y
    `emailVerified` de la proyección y le da la forma JSON
    que requiere el spec
    (`{ id, email, name, image, defaultProvider,
    lastLoginAt }`). `Session.isActive(now)` devuelve false
    en sesiones expiradas. Las entidades son tipos TS planos
    + factory functions; sin imports de Prisma.
  - **Archivos**:
    `src/modules/auth/domain/entities/user.ts`,
    `src/modules/auth/domain/entities/account.ts`,
    `src/modules/auth/domain/entities/session.ts`,
    `src/modules/auth/domain/value-objects/public-user.ts`,
    `*.test.ts` al lado de cada uno
  - **Estimación de líneas**: 90
  - **Depende de**: T-006
  - **Tests**: 8 casos. Patrón AAA. Parametrizado para los
    casos de normalización de email.
  - **Verificar**: `pnpm test src/modules/auth/domain/entities/
    src/modules/auth/domain/value-objects/` salen 0;
    `pnpm run typecheck` sale 0.

- [x] **T-011** Interfaces de port de dominio (3 ports) + singleton de Prisma
  - **Alcance (RED → GREEN)**: los ports son interfaces TS
    en `src/modules/auth/domain/interfaces/`:
    `UserRepositoryPort` (create, findById, findByEmail,
    update), `AccountRepositoryPort` (create, findUnique),
    `SessionRepositoryPort` (findByToken, delete). El "test"
    es un smoke de tipos: una implementación fake compila
    contra el port. El singleton de Prisma vive en
    `src/shared/db/prisma.ts` y está envuelto con un hook de
    override solo para tests para que la suite de Vitest
    pueda sustituir el cliente. `src/shared/db/prisma.test.ts`
    asegura que el singleton devuelve la misma instancia en
    dos llamadas consecutivas y que el hook de override
    funciona.
  - **Archivos**:
    `src/modules/auth/domain/interfaces/{user,account,session}.repository.port.ts`,
    `src/shared/db/prisma.ts`,
    `src/shared/db/prisma.test.ts`
  - **Estimación de líneas**: 60
  - **Depende de**: T-010
  - **Tests**: 3 casos para el singleton de Prisma. Los
    ports se type-checkean en tiempo de compilación.
  - **Verificar**: `pnpm test src/shared/db/` sale 0;
    `pnpm run typecheck` sale 0 (los ports compilan).

- [x] **T-012** `PasswordService` (wrapper de Argon2id) + script de benchmark
  - **Alcance (RED → GREEN)**: los tests aseguran:
    `hashArgon2id('a-password')` devuelve un string que
    empieza con `$argon2id$`; `verifyArgon2id(hash,
    'a-password')` es `true`; `verifyArgon2id(hash,
    'b-password')` es `false`; dos llamadas consecutivas
    de `hash` producen salts diferentes. Los parámetros
    elegidos están codificados como constantes:
    `memoryCost = 19456` KiB, `timeCost = 2`,
    `parallelism = 1` (BR-AUTH-3). La librería es
    `@node-rs/argon2`; si el prebuilt falla al cargar en
    la máquina destino, la tarea cae al fallback `argon2`
    (npm). El script de benchmark `scripts/bench-argon2.ts`
    mide el p50 del tiempo de hash en la máquina del
    desarrollador e imprime un veredicto `BAND_OK` /
    `BAND_SLOW` / `BAND_FAST`. El test de seguridad
    `argon2.parameters.test.ts` (en Fase 7) re-corre el
    benchmark en CI.
  - **Archivos**:
    `src/modules/auth/infrastructure/external/argon2.hasher.ts`,
    `src/modules/auth/infrastructure/external/argon2.hasher.test.ts`,
    `scripts/bench-argon2.ts`
  - **Estimación de líneas**: 110
  - **Depende de**: T-005, T-008
  - **Tests**: 5 casos. Patrón AAA. Parametrizado para
    input válido/inválido.
  - **Verificar**: `pnpm test src/modules/auth/infrastructure/external/argon2.hasher.test.ts`
    sale 0; `pnpm tsx scripts/bench-argon2.ts` corre hasta
    el final e imprime un tiempo de hash en milisegundos +
    el veredicto de banda.

- [x] **T-013** `DefaultProviderPolicy` (servicio de dominio: estampa `defaultProvider` en el primer registro)
  - **Alcance (RED → GREEN)**: los tests aseguran la policy
    del design: `stampDefaultProvider(user, 'local' | 'google')`
    devuelve el valor a escribir — para un usuario existente
    con `defaultProvider` ya seteado, el valor existente se
    preserva (BR-AUTH-13: nunca cambia tras el primer
    registro); para un usuario nuevo, se setea el valor
    nuevo. `inferProviderFromOAuthProfile(profile)` devuelve
    `'google'` para un perfil de Google con
    `email_verified: true`, lanza un `AppError(INTERNAL_ERROR)`
    para cualquier otro provider, y nunca devuelve para
    `email_verified: false` (el flujo OAuth falla antes en
    la capa de Auth.js según BR-AUTH-6; esto es una
    defensa en profundidad).
  - **Archivos**:
    `src/modules/auth/domain/services/default-provider.policy.ts`,
    `src/modules/auth/domain/services/default-provider.policy.test.ts`
  - **Estimación de líneas**: 50
  - **Depende de**: T-010
  - **Tests**: 5 casos. Patrón AAA. Parametrizado para
    "primer registro" vs. "sign-in subsiguiente".
  - **Verificar**: `pnpm test
    src/modules/auth/domain/services/default-provider.policy.test.ts`
    sale 0; cobertura ≥ 80 % en ramas en el archivo de
    la policy.

- [x] **T-014** `AuthService` (orquestador: register, set default provider, build PublicUser)
  - **Alcance (RED → GREEN)**: los tests aseguran tres
    comportamientos con ports fake (sin DB, sin HTTP):
    - `register({ email, password })`:
      `findByEmail(normalized)` se llama primero; si es
      null, se invoca `hashArgon2id` y se hace `create`
      de una fila `User`; si es duplicado, se lanza
      `EMAIL_TAKEN` con la misma llamada a `hashArgon2id`
      ecualizando el timing (BR-AUTH-4). En éxito, el
      evento `UserRegistered` se dispatcha exactamente
      una vez vía el dispatcher in-process.
    - `applyDefaultProviderOnOAuth(userId, 'google')`:
      delega a `DefaultProviderPolicy` y persiste el
      resultado. El evento `UserRegistered` se dispatcha
      exactamente una vez para el primer signup OAuth
      (no en el auto-link, según BR-AUTH-5).
    - `buildPublicUser(userId)`: lee la fila del usuario,
      aplica `PublicUser.from`, devuelve la proyección.
      `passwordHash` y `emailVerified` NUNCA están en
      el output.
  - **Archivos**:
    `src/modules/auth/domain/services/auth.service.ts`,
    `src/modules/auth/domain/services/auth.service.test.ts`
  - **Estimación de líneas**: 130
  - **Depende de**: T-009, T-011, T-012, T-013
  - **Tests**: 12 casos. Patrón AAA. Todas las
    interacciones con ports se registran con un spy
    fake; sin lógica en los bodies de los tests.
  - **Verificar**: `pnpm test
    src/modules/auth/domain/services/auth.service.test.ts`
    sale 0; cobertura ≥ 80 % en líneas y ramas en el
    archivo del servicio.

### Fase 3 — Infraestructura de auth (schema de Prisma, migraciones, repos, cableado de Auth.js)

- [x] **T-015** Schema de Prisma (4 tablas) + migración versionada (sólo schema; generación de migración diferida — ver apply-progress.md)
  - **Alcance (RED → GREEN)**: el schema de Prisma en
    `prisma/schema.prisma` define los cuatro modelos
    canónicos de Auth.js (`User`, `Account`, `Session`,
    `VerificationToken`) según §5 del design. Se agregan
    tres columnas a `User` (`passwordHash`,
    `defaultProvider`, `lastLoginAt`) según BR-AUTH-9 /
    BR-AUTH-13 / la entidad `User` del spec. Índices:
    `User.email` (implícito por `@unique`), `User.createdAt`
    (`@@index` explícito), `Account(provider,
    providerAccountId)` (`@@unique`), `Session.sessionToken`
    (implícito por `@unique`), `Session.expires`
    (`@@index` explícito para el futuro job de GC). Los
    tests usan un fixture de Vitest que aplica la migración
    a un testcontainer de Postgres y asegura las formas
    de tabla y la unique constraint en
    `Account(provider, providerAccountId)` (BR-AUTH-10).
    La migración se genera con
    `pnpm prisma migrate dev --name auth_foundation` y el
    archivo SQL resultante se commitea en
    `prisma/migrations/<timestamp>_auth_foundation/migration.sql`.
  - **Archivos**: `prisma/schema.prisma`,
    `prisma/schema.test.ts`,
    `prisma.config.ts`,
    `prisma/migrations/<timestamp>_auth_foundation/migration.sql`
    (generado)
  - **Estimación de líneas**: 90
  - **Depende de**: T-005, T-011
  - **Tests**: 5 casos que introspeccionan el
    information_schema de Postgres tras aplicar la
    migración. Patrón AAA. Cada test usa un testcontainer
    de Postgres fresco.
  - **Verificar**: `pnpm prisma migrate dev --name
    auth_foundation` produce el SQL de migración;
    `pnpm test prisma/schema.test.ts` sale 0;
    `pnpm prisma generate` regenera el cliente tipado
    sin errores.

- [x] **T-016** `UserRepository` (adapter de Prisma — probado con fake; testcontainers diferidos a la fase verify)
  - **Alcance (RED → GREEN)**: los tests contra un
    testcontainer real de Postgres cubren: `create(user)`
    devuelve la fila con todos los campos persistidos;
    `findById` devuelve `null` para ids desconocidos;
    `findByEmail` es case-insensitive (insertar
    `'A@B.com'`, buscar `'a@b.com'`, obtener la fila —
    normalización en la capa de aplicación, no
    `citext` de Postgres); `update` muta `lastLoginAt`
    y `defaultProvider` y bumpea `updatedAt`. El
    repositorio implementa `UserRepositoryPort` de T-011.
  - **Archivos**:
    `src/modules/auth/infrastructure/repositories/user.repository.ts`,
    `src/modules/auth/infrastructure/repositories/user.repository.test.ts`
  - **Estimación de líneas**: 60
  - **Depende de**: T-015
  - **Tests**: 4 casos. Patrón AAA. Cada test usa un
    testcontainer de Postgres fresco.
  - **Verificar**: `pnpm test
    src/modules/auth/infrastructure/repositories/user.repository.test.ts`
    sale 0.

- [x] **T-017** `AccountRepository` (adapter de Prisma) + `SessionRepository` (probado con fake; testcontainers diferidos a la fase verify)
  - **Alcance (RED → GREEN)**: los tests cubren:
    `Account.create` devuelve la fila;
    `Account.findUnique({ provider, providerAccountId })`
    devuelve la fila y `null` para subjects
    desconocidos; la unique constraint compuesta en
    `(provider, providerAccountId)` se enforcea a nivel
    DB (el test asegura que un segundo `create` con el
    mismo `(provider, providerAccountId)` lanza un
    error Prisma `P2002` — la línea de defensa de
    BR-AUTH-10). `Session.findByToken(token)` devuelve
    la fila y `null` en caso contrario;
    `Session.delete(token)` elimina la fila. Ambos
    repositorios implementan sus respectivos ports de
    T-011.
  - **Archivos**:
    `src/modules/auth/infrastructure/repositories/account.repository.ts`,
    `src/modules/auth/infrastructure/repositories/account.repository.test.ts`,
    `src/modules/auth/infrastructure/repositories/session.repository.ts`,
    `src/modules/auth/infrastructure/repositories/session.repository.test.ts`
  - **Estimación de líneas**: 80
  - **Depende de**: T-015
  - **Tests**: 6 casos. Patrón AAA. El test de violación
    de unique se parametriza sobre la forma
    `(provider, providerAccountId)`.
  - **Verificar**: `pnpm test
    src/modules/auth/infrastructure/repositories/`
    sale 0; cobertura ≥ 80 % en ambos archivos de
    repositorio.

- [x] **T-018** Configuración de Auth.js v5 (`src/modules/auth/infrastructure/external/authjs.ts`)
  - **Alcance (RED → GREEN)**: la constante `authConfig`
    cablea el adapter de Prisma, el provider de Google
    (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`,
    `prompt=select_account`, `scope=openid email profile`),
    el provider de Credenciales (la función `authorize()`
    de §3 del design con normalización de email, la
    ecualización de `DUMMY_HASH` al init del módulo según
    BR-AUTH-4 / BR-AUTH-9, y la forma de retorno de 4
    campos del usuario), el callback `signIn` (estampa
    `lastLoginAt` en cada sign-in exitoso, nunca muta
    `defaultProvider` según BR-AUTH-13), el callback
    `session` (agrega `defaultProvider` y `lastLoginAt`
    al JSON de session para el hook `useSession()`),
    `session.strategy = 'database'`, `session.maxAge =
    30 * 24 * 60 * 60`, y `pages.signIn = '/auth/signin'`.
    El módulo destructura `NextAuth(authConfig)` y
    exporta `{ handlers, auth, signIn, signOut }`. El
    test asegura la forma de los nombres exportados y
    que el `DUMMY_HASH` se genera una vez al init del
    módulo (idempotente a través de dos `import`s del
    módulo).
  - **Archivos**:
    `src/modules/auth/infrastructure/external/authjs.ts`,
    `src/modules/auth/infrastructure/external/authjs.test.ts`
  - **Estimación de líneas**: 140
  - **Depende de**: T-005, T-012, T-014, T-016, T-017
  - **Tests**: 6 casos. Patrón AAA. La idempotencia del
    init del módulo se asegura importando el módulo
    dos veces en el mismo test y comparando las
    referencias de `DUMMY_HASH`.
  - **Verificar**: `pnpm test
    src/modules/auth/infrastructure/external/authjs.test.ts`
    sale 0; `pnpm run typecheck` sale 0.

### Fase 4 — Aplicación de auth (actions + DTOs)

- [ ] **T-019** `registerAction` + DTO
  - **Alcance (RED → GREEN)**: el DTO usa Zod para validar
    `{ email, password }` (formato de email, longitud de
    password ≥ 10 según BR-AUTH-2). La action delega en
    `AuthService.register` y devuelve un
    `{ data: { id, email, name, image, defaultProvider } }`
    tipado en éxito (la proyección pública, NUNCA
    `passwordHash`) o un
    `{ error: { code, message, details? } }` tipado en
    fallo (según la forma de respuesta de la skill
    `api-design`). Los tests cubren: 201 en éxito con la
    proyección esperada; 400 `VALIDATION_ERROR` en fallo
    de Zod; 400 `WEAK_PASSWORD` en longitud < 10; 409
    `EMAIL_TAKEN` con timing comparable (el test asegura
    que la llamada a `hash` se hace tanto en la rama de
    éxito como en `EMAIL_TAKEN` — el test de security
    timing en Fase 7 mide la latencia end-to-end). El
    evento `UserRegistered` se dispatcha exactamente
    una vez en el primer registro.
  - **Archivos**:
    `src/modules/auth/application/dto/register.dto.ts`,
    `src/modules/auth/application/dto/register.dto.test.ts`,
    `src/modules/auth/application/actions/register.action.ts`,
    `src/modules/auth/application/actions/register.action.test.ts`
  - **Estimación de líneas**: 70
  - **Depende de**: T-009, T-014, T-016
  - **Tests**: 5 casos. Patrón AAA.
  - **Verificar**: `pnpm test
    src/modules/auth/application/actions/register.action.test.ts`
    sale 0.

- [ ] **T-020** `meAction` + `healthAction` + DTOs
  - **Alcance (RED → GREEN)**: `meAction(c)` devuelve
    `{ data: PublicUser }` cuando `c.get('user')` está
    seteado (i.e. `auth()` resolvió una sesión válida) y
    401 `UNAUTHORIZED` en caso contrario — forma de
    respuesta idéntica a través de los cuatro modos de
    fallo (sin sesión, cookie faltante, sesión expirada,
    usuario desconocido). `healthAction(c)` devuelve 200
    con `{ data: { status: 'ok', version, uptime } }` (la
    `version` se lee de `package.json` al init del
    módulo; `uptime` es `process.uptime()`). Los tests
    usan `app.request` de Hono para invocar las actions
    con un contexto fake.
  - **Archivos**:
    `src/modules/auth/application/dto/me.dto.ts`,
    `src/modules/auth/application/dto/me.dto.test.ts`,
    `src/modules/auth/application/dto/health.dto.ts`,
    `src/modules/auth/application/dto/health.dto.test.ts`,
    `src/modules/auth/application/actions/me.action.ts`,
    `src/modules/auth/application/actions/me.action.test.ts`,
    `src/modules/auth/application/actions/health.action.ts`,
    `src/modules/auth/application/actions/health.action.test.ts`
  - **Estimación de líneas**: 90
  - **Depende de**: T-005, T-014
  - **Tests**: 6 casos a través de las dos actions.
    Patrón AAA. Parametrizado para los 4 modos de fallo
    de `me`.
  - **Verificar**: `pnpm test
    src/modules/auth/application/actions/me.action.test.ts
    src/modules/auth/application/actions/health.action.test.ts`
    sale 0.

### Fase 5 — UI de auth (catch-all de Hono, página signIn de Auth.js, página signOut)

- [ ] **T-021** Composición de la app Hono `OpenAPIHono` (`src/modules/api/app.ts`)
  - **Alcance (RED → GREEN)**: la app de Hono es una
    instancia `OpenAPIHono`. Un middleware `*` resuelve
    `auth()` (Auth.js) una vez por request y setea
    `c.set('user', session?.user ?? null)` y
    `c.set('session', session ?? null)`. Se montan tres
    rutas: `GET /health` (pública, llama a
    `healthAction`), `GET /me` (llama a `meAction`,
    devuelve 401 `UNAUTHORIZED` cuando `c.get('user')`
    es null), `POST /auth/register` (mutante, pasa por
    el middleware `originCheck`, llama a
    `registerAction`). Los tests usan `app.request` de
    Hono para asegurar: `GET /health` devuelve 200 con
    `{ data: { status, version, uptime } }`; `GET /me`
    devuelve 200 con un `PublicUser` válido cuando se
    inyecta un `auth()` fake que devuelve una sesión,
    401 `UNAUTHORIZED` cuando devuelve null;
    `POST /auth/register` devuelve 201 en éxito, 400 en
    fallo de validación, 403 `FORBIDDEN` en POST
    cross-origin. La instancia `OpenAPIHono` se exporta
    como `honoApp` y se re-exporta desde
    `src/modules/api/index.ts`.
  - **Archivos**:
    `src/modules/api/app.ts`,
    `src/modules/api/app.test.ts`,
    `src/modules/api/middlewares/origin-check.ts`,
    `src/modules/api/middlewares/origin-check.test.ts`,
    `src/modules/api/index.ts`
  - **Estimación de líneas**: 130
  - **Depende de**: T-007, T-014, T-019, T-020
  - **Tests**: 9 casos. Patrón AAA. Parametrizado para
    los casos permitido/denegado de origin-check.
  - **Verificar**: `pnpm test src/modules/api/` sale 0;
    `pnpm run typecheck` sale 0.

- [ ] **T-022** Exportación del cliente tipado de Hono (`src/modules/api/client.ts`)
  - **Alcance**: la instancia del cliente tipado
    `hc<typeof honoApp>` se exporta en
    `src/modules/api/client.ts` y se re-exporta desde
    `src/modules/api/index.ts`. El test asegura que el
    cliente es una función (la factory `hc` de Hono) y
    que el tipo de respuesta inferido para
    `client.me.$get()` matchea la interfaz `MeSuccess`
    (verificación de tipos en tiempo de compilación vía
    `Expect<Equal<...>>`).
  - **Archivos**:
    `src/modules/api/client.ts`,
    `src/modules/api/client.test.ts`
  - **Estimación de líneas**: 30
  - **Depende de**: T-021
  - **Tests**: 2 casos. Aserciones de tipo en tiempo de
    compilación + forma de la función en runtime.
  - **Verificar**: `pnpm test src/modules/api/client.test.ts`
    sale 0; `pnpm run typecheck` sale 0.

- [ ] **T-023** Página signIn de Auth.js en `app/auth/signin/page.tsx` (server component + form action)
  - **Alcance**: la página es un server component de
    Next.js que renderiza un formulario con inputs de
    email + password (usando TanStack React Form para
    los inputs controlados) y un botón "Sign in with
    Google". El formulario postea a
    `signIn('credentials', { ... })` desde
    `next-auth/react` en el cliente; el botón de Google
    postea a `signIn('google')`. La página lee
    `searchParams.error` para mostrar `OAuthAccountNotLinked`
    y otros códigos de error de Auth.js con un mensaje
    claro en español orientado al usuario según la
    decisión "UX de OAuthAccountNotLinked" del design
    ("This Google account is already linked to a
    different email. Sign out and try again, or contact
    support."). La página se registra vía
    `pages.signIn = '/auth/signin'` en `authConfig`
    (T-018). Un test pequeño asegura que la página se
    renderiza sin lanzar cuando se le da un
    `searchParams` vacío y con un
    `error=OAuthAccountNotLinked` de ejemplo.
  - **Archivos**:
    `app/auth/signin/page.tsx`,
    `app/auth/signin/page.test.tsx`,
    `app/auth/signout/page.tsx`
  - **Estimación de líneas**: 80
  - **Depende de**: T-018
  - **Tests**: 3 casos. Patrón AAA. La página se
    renderiza con React Testing Library y un harness de
    App Router de Next.js.
  - **Verificar**: `pnpm test app/auth/signin/page.test.tsx`
    sale 0; `pnpm run build` sale 0 (Next.js compila
    la ruta).

### Fase 6 — Composición de la app (montar rutas, API pública, middleware)

- [ ] **T-024** Montar `app/api/auth/[...nextauth]/route.ts` (handler de Auth.js)
  - **Alcance**: un archivo de 2 líneas que re-exporta
    `GET` y `POST` desde los `handlers` de Auth.js
    destructurados en `authjs.ts` (T-018). Un test bootea
    el dev server de Next.js en modo test, pega a
    `/api/auth/providers`, y asegura que la forma de la
    respuesta incluye `{ id: 'google' }, { id:
    'credentials' }`.
  - **Archivos**:
    `app/api/auth/[...nextauth]/route.ts`,
    `app/api/auth/[...nextauth]/route.test.ts`
  - **Estimación de líneas**: 20
  - **Depende de**: T-018
  - **Tests**: 1 caso (integración). Patrón AAA. El test
    usa los helpers de test de Next.js; se requiere un
    testcontainer de Postgres.
  - **Verificar**: `pnpm test app/api/auth/` sale 0;
    `pnpm run build` sale 0.

- [ ] **T-025** Montar `app/api/[...path]/route.ts` (catch-all de Hono)
  - **Alcance**: un archivo pequeño que delega
    `GET`/`POST`/`PATCH`/`DELETE` a
    `honoApp.fetch(request)`. El catch-all de Hono NO
    matchea `/api/auth/*` porque el routing basado en
    archivos de Next.js resuelve primero la ruta más
    específica `app/api/auth/[...nextauth]/route.ts`. Un
    test asegura que `/api/auth/signin` se enruta a
    Auth.js (devuelve la respuesta HTML de Auth.js) y
    `/api/me` se enruta a Hono (devuelve la forma JSON
    de Hono). Ambas rutas se testean contra el mismo
    server de Next.js.
  - **Archivos**:
    `app/api/[...path]/route.ts`,
    `app/api/[...path]/route.test.ts`
  - **Estimación de líneas**: 30
  - **Depende de**: T-021, T-024
  - **Tests**: 2 casos. Patrón AAA. Ambos son tests de
    integración contra un server de Next.js real.
  - **Verificar**: `pnpm test app/api/` sale 0;
    `pnpm run build` sale 0.

- [ ] **T-026** Exportación de API pública (`src/modules/auth/index.ts`) + middleware de Next.js para protección de `/api/me`
  - **Alcance**: la superficie pública del módulo `auth`
    es lo único que otros módulos (futuros:
    `accounts-ledger`, `transactions`) pueden importar.
    El archivo exporta `auth`, `signIn`, `signOut`,
    `handlers` (el `GET` y `POST` para `/api/auth/*`),
    `honoApp` (la instancia `OpenAPIHono` para el
    catch-all de Hono), y las constantes con los nombres
    de evento `UserRegistered` y `UserSignedIn`. Los
    paths internos (internos de los servicios de dominio,
    internos de los repos, internos de los adapters
    externos) no se exportan. Un test asegura que las
    exports con nombre existen y que `import` desde un
    path no exportado es un error de TypeScript
    (verificación en tiempo de compilación).
    Adicionalmente, un middleware de Next.js en
    `middleware.ts` (raíz del proyecto) protege cualquier
    ruta futura protegida bajo `/app/*` (server
    components que necesitan un usuario autenticado); la
    ruta Hono `/api/me` ya devuelve 401 cuando falta la
    sesión, pero el middleware es el camino de fail-fast
    para páginas de App Router.
  - **Archivos**:
    `src/modules/auth/index.ts`,
    `src/modules/auth/index.test.ts`,
    `middleware.ts`
  - **Estimación de líneas**: 50
  - **Depende de**: T-018, T-021, T-025
  - **Tests**: 2 casos. El test de la API pública
    asegura las exports con nombre; el test del
    middleware asegura un redirect 302 a `/auth/signin`
    para un request no autenticado a `/dashboard` (una
    ruta placeholder) y un 200 para un request
    autenticado.
  - **Verificar**: `pnpm test src/modules/auth/index.test.ts`
    sale 0; `pnpm run typecheck` sale 0;
    `pnpm run build` sale 0.

### Fase 7 — Tests de seguridad (suite dedicada, input de revisión adversarial)

- [ ] **T-027** Suite de tests de seguridad (timing, OAuth state, secretos en logs, origin-check, parámetros Argon2id, atributos de cookie)
  - **Alcance**: seis tests de integración enfocados en
    `src/modules/auth/__tests__/security/`:
    1. **`login.timing.test.ts`**: con un hash Argon2id
       real y un hash dummy fijo, el tiempo de respuesta
       del `authorize()` de Credenciales para la rama
       "wrong password" y la rama "unknown email" están
       dentro de un umbral estadístico documentado (p.ej.
       t-test de Welch p > 0.01 sobre 30 muestras). El
       test corre en CI; en dev local un flag
       `--skip-timing` tolera máquinas ruidosas.
    2. **`oauth.state-csrf.test.ts`**: un callback con un
       parámetro `state` faltante o alterado es rechazado
       por Auth.js. No se crea ningún `User` ni se
       inserta ninguna fila `Account` en cualquier caso
       de fallo (asegurado por un conteo de filas).
    3. **`secrets.in-logs.test.ts`**: un request que
       incluye un `password`, un `refresh_token`, un
       header `Authorization: Bearer <jwt>`, un
       `id_token`, o un token CSRF no causa que ninguno
       de esos valores aparezca en el output de log
       capturado a través de los caminos de register,
       callback OAuth y resolución de session
       (BR-AUTH-11).
    4. **`origin-check.test.ts`**:
       `POST /api/auth/register` con un header `Origin`
       faltante o no coincidente devuelve 403
       `FORBIDDEN`. POST mismo-origen está permitido.
    5. **`argon2.parameters.test.ts`**: `hashArgon2id`
       con los parámetros elegidos
       (`memoryCost=19456, timeCost=2, parallelism=1`)
       produce un hash en el rango 50–100 ms en el
       runner de CI. Falla el test si el runtime está
       fuera de la banda. El benchmark es el mismo que
       `scripts/bench-argon2.ts` corre localmente; el
       test lo re-corre en CI.
    6. **`cookie.attributes.test.ts`**: la cookie
       `authjs.session-token` tiene `HttpOnly` y
       `SameSite=Lax` siempre; `Secure` en producción,
       omitido en dev. El test hace sign-in con un
       `authorize()` de Credenciales e inspecciona el
       header `Set-Cookie` de la respuesta.
  - **Archivos**:
    `src/modules/auth/__tests__/security/login.timing.test.ts`,
    `src/modules/auth/__tests__/security/oauth.state-csrf.test.ts`,
    `src/modules/auth/__tests__/security/secrets.in-logs.test.ts`,
    `src/modules/auth/__tests__/security/origin-check.test.ts`,
    `src/modules/auth/__tests__/security/argon2.parameters.test.ts`,
    `src/modules/auth/__tests__/security/cookie.attributes.test.ts`
  - **Estimación de líneas**: 170
  - **Depende de**: T-026
  - **Tests**: 14 casos a través de los seis archivos.
    Patrón AAA. El test de timing se parametriza sobre
    las 30 muestras; el test de secrets-in-logs se
    parametriza sobre los seis tipos de claves
    sensibles.
  - **Verificar**: `pnpm test
    src/modules/auth/__tests__/security/` sale 0; CI
    corre esta suite como un job requerido.

### Fase 8 — CI / quality gates

- [ ] **T-028** Crear `.github/workflows/ci.yml`
  - **Alcance**: un workflow de CI con cuatro jobs
    paralelos:
    1. `lint`: `pnpm install --frozen-lockfile`,
       `pnpm run lint`, `pnpm run typecheck`.
    2. `test`: `pnpm install --frozen-lockfile`,
       `pnpm prisma migrate deploy`, `pnpm test --
       --coverage`, sube el artifact `coverage/`, postea
       un comentario sticky en el PR con los porcentajes
       de cobertura.
    3. `build`: `pnpm install --frozen-lockfile`,
       `pnpm run build` (build de producción de Next.js
       — captura errores de tipo que solo aparecen en
       build, p.ej. fronteras RSC vs. client component).
    4. `security`: `pnpm test
       src/modules/auth/__tests__/security/` (el job más
       lento; se corre por separado para que un flake
       del test de timing no bloquee a los jobs de lint
       y build de reportar).
    Todos los jobs corren en `pull_request` a `develop`
    o `main`, y en `push` a `develop` o `main`. El
    workflow usa `actions/setup-node@v4` con
    `cache: 'pnpm'` y `corepack: true` (el campo
    `packageManager` en `package.json` provee la versión
    de pnpm). La concurrencia cancela runs en vuelo
    sobre el mismo ref. No hay `force` push a `main`
    (según la skill `ci-cd-pipeline`).
  - **Archivos**: `.github/workflows/ci.yml`
  - **Estimación de líneas**: 90
  - **Depende de**: T-027
  - **Tests**: N/A. CI es el test.
  - **Verificar**: Hacer push de la rama dispara el
    workflow; el link "PR docs" apunta al check verde.

- [ ] **T-029** Protección de rama + `CODEOWNERS`
  - **Alcance**: un archivo `.github/CODEOWNERS` en la
    raíz del repo que apunta al maintainer (`@sebailla`).
    Un documento corto en `docs/branch-protection.md`
    describe las reglas que el parent aplicará a
    `develop` en GitHub: requerir 1 review, requerir CI
    verde (`lint`, `typecheck`, `test`, `build`,
    `security`), descartar aprobaciones obsoletas en
    push, requerir historia lineal, no force-pushes. Sin
    cambio de código; esto es config-as-docs. La
    configuración real de protección de rama de GitHub
    la aplica manualmente el usuario (no en este cambio)
    porque requiere permisos de repo-admin.
  - **Archivos**: `.github/CODEOWNERS`,
    `docs/branch-protection.md`
  - **Estimación de líneas**: 30
  - **Depende de**: T-028
  - **Tests**: N/A.
  - **Verificar**: `cat .github/CODEOWNERS` lista al
    maintainer; `cat docs/branch-protection.md` describe
    las reglas.

### Fase 9 — Documentación

- [ ] **T-030** Cinco ADRs (Auth.js v5, Prisma 6, Argon2id, catch-all de Hono, auto-link)
  - **Alcance**: cinco ADRs en `docs/adr/` cubriendo las
    decisiones que el design dejó abiertas. Cada ADR
    sigue el template MADR (Context, Decision,
    Consequences, Alternatives considered).
    - `0001-authjs-v5.md` — por qué Auth.js v5 sobre
      Lucia, Clerk, Supabase Auth, hecho a mano.
    - `0002-prisma-6.md` — por qué Prisma 6 sobre
      Kysely, SQL crudo.
    - `0003-argon2id-parameters.md` — los parámetros
      finales (`memoryCost=19456, timeCost=2,
      parallelism=1`), el resultado del benchmark, el
      camino de fallback.
    - `0004-hono-catch-all.md` — por qué Hono sobre
      route handlers puros de Next.js, tRPC, Fastify;
      la forma de exportación del cliente tipado
      `OpenAPIHono` + `hc<typeof honoApp>`.
    - `0005-auto-link-security-model.md` —
      auto-link estándar de la industria por coincidencia
      de email (Notion, Linear, Vercel); BR-AUTH-5 /
      BR-AUTH-10; el deferral de un pase de
      hardening.
  - **Archivos**:
    `docs/adr/0001-authjs-v5.md`,
    `docs/adr/0002-prisma-6.md`,
    `docs/adr/0003-argon2id-parameters.md`,
    `docs/adr/0004-hono-catch-all.md`,
    `docs/adr/0005-auto-link-security-model.md`
  - **Estimación de líneas**: 200
  - **Depende de**: T-012, T-018, T-021
  - **Tests**: N/A.
  - **Verificar**: `ls docs/adr/` lista los cinco ADRs;
    `grep -c "^## Decision" docs/adr/*.md` devuelve 5.

- [ ] **T-031** Actualizar `docs/architecture.md` (sección Auth) + espejo en español
  - **Alcance**: `docs/architecture.md` gana una sección
    "Auth" con: un diagrama Mermaid de alto nivel (el
    mismo de §1 del design), resumen del modelo de datos
    (los cuatro modelos de Prisma, las tres columnas
    agregadas, la unique constraint en `Account`), las
    ocho rutas de Auth.js y las tres rutas de Hono, la
    estrategia de sesión (sesiones de base de datos, 30
    días con sliding, sin JWT), el modelo de seguridad
    del auto-link, y los contratos cross-module (helper
    `auth()`, `User` es el ancla de identidad, eventos
    `UserRegistered` / `UserSignedIn`). El espejo en
    español en `Documents-es/docs/architecture.md` se
    actualiza en el mismo commit.
  - **Archivos**: `docs/architecture.md`,
    `Documents-es/docs/architecture.md`
  - **Estimación de líneas**: 100
  - **Depende de**: T-030
  - **Tests**: N/A. Un detector de drift en CI (un job
    `diff` simple) captura la divergencia.
  - **Verificar**:
    `diff <(grep -v '^\*\*' docs/architecture.md) <(grep -v '^\*\*' Documents-es/docs/architecture.md)`
    devuelve solo diferencias de traducción;
    `pnpm run lint` sobre el Markdown está limpio.

- [ ] **T-032** Actualizar `README.md` (dev local) + espejo en español
  - **Alcance**: el `README.md` raíz gana una sección
    "Local development" que explica: `pnpm install`,
    `cp .env.example .env` y completar los valores,
    `pnpm prisma migrate dev`, `pnpm test`, `pnpm run
    lint`, `pnpm run typecheck`, `pnpm run build`,
    `pnpm run dev`, y el smoke
    `scripts/bench-argon2.ts` para los parámetros
    Argon2id. El espejo en español en
    `Documents-es/README.md` se actualiza en el mismo
    commit.
  - **Archivos**: `README.md`,
    `Documents-es/README.md`
  - **Estimación de líneas**: 80
  - **Depende de**: T-026
  - **Tests**: N/A.
  - **Verificar**: un clone fresco siguiendo los pasos
    del README bootea el server (`pnpm run dev`) y
    sirve `/api/health` devolviendo 200.

### Fase 10 — Handoff

- [ ] **T-033** Commit final, push, abrir PR, pedir reviewer
  - **Alcance**: el worker pushea la rama con
    `git push -u origin feat/auth-foundation` y abre el
    primero de los tres PRs encadenados con
    `gh pr create --base develop --title "feat(auth): <título del slice 1>" --body <cuerpo del PR desde docs/architecture.md + un checklist>`.
    El cuerpo del PR cita el nombre del cambio, enlaza
    los artefactos de OpenSpec
    (`openspec/changes/auth-foundation/{proposal,design,tasks}.md`),
    y lista el checklist de "Definition of done" de
    abajo. El PR se marca como listo; el parent despacha
    un subagent `reviewer` fresco (según `AGENTS.md` §2.2)
    para revisión adversarial. El PR **no** se mergea
    aquí; el merge sucede solo después de que el
    reviewer pase. El mismo patrón se repite para el
    slice 2 y slice 3 una vez que el slice 1 llega a
    `develop`.
  - **Archivos**: cuerpo del PR, mensajes de commit
  - **Estimación de líneas**: 30
  - **Depende de**: T-001 a T-032
  - **Tests**: N/A.
  - **Verificar**: `gh pr view <pr-number> --json
    state,mergeable,statusCheckRollup` muestra
    `state: OPEN`, `mergeable: MERGEABLE`, todos los
    status checks `SUCCESS`.

## Pronóstico de carga de revisión (obligatorio)

| Fase | Tareas | Estimación de líneas |
|---|---:|---:|
| Fase 0 — Scaffolding | 4 (T-001…T-004) | 260 |
| Fase 1 — Infra compartida | 5 (T-005…T-009) | 380 |
| Fase 2 — Dominio de auth | 5 (T-010…T-014) | 440 |
| Fase 3 — Infra de auth | 4 (T-015…T-018) | 370 |
| Fase 4 — Aplicación de auth | 2 (T-019…T-020) | 160 |
| Fase 5 — UI de auth | 3 (T-021…T-023) | 240 |
| Fase 6 — Composición de la app | 3 (T-024…T-026) | 100 |
| Fase 7 — Tests de seguridad | 1 (T-027) | 170 |
| Fase 8 — CI / calidad | 2 (T-028…T-029) | 120 |
| Fase 9 — Documentación | 3 (T-030…T-032) | 380 |
| Fase 10 — Handoff | 1 (T-033) | 30 |
| **Total** | **33** | **~2,650** |

**Total > 800 líneas**: 3 PRs encadenados son
**requeridos** (según la elección de preflight del
usuario `auto-forecast` con `reviewBudgetLines: 400`).
Las fronteras de slice abajo están diseñadas para
mantener cada PR ≤ 400 líneas neto de boilerplate de
tests y scaffold pre-existente.

### Slice A — PR 1 (Piso + infra compartida + dominio de auth + infra de auth)

- **Fases incluidas**: 0, 1, 2, 3.
- **Tareas incluidas**: T-001 a T-018.
- **Tamaño aprox. del diff**: 260 + 380 + 440 + 370 =
  **~1,450 líneas** (por encima del presupuesto de 400
  líneas; la justificación sigue).
- **Lo que ve el reviewer**: el piso del proyecto
  (scaffolding de Next.js 16, ESLint, Prettier, Vitest,
  Husky + commitlint + GGA, `.env.example`,
  `.gitignore`), la infraestructura compartida
  cross-cutting (schema de env con Zod y validación
  cross-field, `AppError`, logger estructurado con
  denylist BR-AUTH-11, middleware de request-id y
  error-handler, helpers de Web Crypto, dispatcher de
  eventos in-process), todo el dominio de auth (User,
  Account, Session como entidades, PublicUser como value
  object, 3 ports, PasswordService con Argon2id +
  benchmark, DefaultProviderPolicy, AuthService como
  orquestador), y toda la infraestructura de auth (schema
  de Prisma con 4 tablas + 1 migración generada, 3
  repositorios, cableado de Auth.js v5 con providers de
  Google + Credenciales, callbacks signIn/session,
  ecualización de timing de DUMMY_HASH). Sin Hono, sin
  rutas de aplicación, sin UI, sin workflow de CI.
- **Por qué no más chico**: el dominio del módulo auth
  (Fase 2) es el código más crítico para la seguridad
  en el proyecto. También es el más chico, tiene cero
  dependencias externas, y es imposible de splittear de
  forma significativa — partir "entidades sin ports" o
  "PasswordService sin AuthService" produce fronteras
  artificiales que no existen en el grafo de runtime.
  La infra de Fase 3 está fuertemente acoplada a los
  ports de Fase 2 (los repos implementan los ports; el
  cableado de Auth.js consume los repos y el
  PasswordService). Un reviewer puede auditar todo el
  núcleo de auth en una sola sentada: ~1,450 líneas de
  TypeScript puro y enfocado con cobertura TDD completa.
- **Riesgo en PR 1**: superficie grande, pero cada
  archivo se lee de arriba a abajo; sin middleware de
  Hono que distraiga, sin UI que testear, sin llamadas
  a terceros.

### Slice B — PR 2 (Actions de aplicación + catch-all de Hono + UI + composición de la app)

- **Fases incluidas**: 4, 5, 6.
- **Tareas incluidas**: T-019 a T-026.
- **Tamaño aprox. del diff**: 160 + 240 + 100 =
  **~500 líneas** (por encima del presupuesto de 400
  líneas; la justificación sigue).
- **Lo que ve el reviewer**: tres actions de aplicación
  (register, me, health) con sus DTOs, la app Hono
  `OpenAPIHono` con el catch-all + middleware
  `origin-check`, la exportación del cliente tipado
  `hc`, las páginas signIn/signOut de Auth.js, los
  route handlers de Auth.js + Hono, el índice del
  módulo de API pública, y el middleware de Next.js
  para protección futura de App Router. Toda la
  superficie HTTP del cambio llega aquí, end-to-end.
- **Por qué no más chico**: las actions de aplicación
  (Fase 4) y el catch-all de Hono (Fase 5) están
  fuertemente acopladas — las actions las llaman los
  handlers de Hono en `app.ts` (T-021). Partir
  "actions sin la app de Hono" significaría que el
  reviewer no puede correr la aplicación. La página
  signIn (T-023) es chica pero depende del cableado de
  Auth.js (T-018) y del routing de Hono (T-021). Un
  PR de ~500 líneas es el mínimo para hacer
  testeable el sign-in end-to-end.
- **Riesgo en PR 2**: ~500 líneas; el reviewer valida
  que el catch-all делега correctamente a Auth.js para
  `/api/auth/*` y a Hono para `/api/*` (el test de
  routing en T-025).

### Slice C — PR 3 (Tests de seguridad + CI + docs + handoff)

- **Fases incluidas**: 7, 8, 9, 10.
- **Tareas incluidas**: T-027 a T-033.
- **Tamaño aprox. del diff**: 170 + 120 + 380 + 30 =
  **~700 líneas** (por encima del presupuesto de 400
  líneas; la justificación sigue).
- **Lo que ve el reviewer**: la suite de tests de
  seguridad (seis tests de integración enfocados que
  cubren timing, OAuth state CSRF, secretos en logs,
  origin-check, parámetros Argon2id, atributos de
  cookie), el workflow de GitHub Actions para CI (jobs
  de lint + typecheck + test + build + security, más el
  `CODEOWNERS` y las notas de protección de rama), cinco
  ADRs y las actualizaciones de architecture + README
  (con espejos en español), y la tarea de handoff que
  abre el PR y pide un subagent `reviewer` de
  contexto fresco.
- **Por qué no más chico**: la suite de seguridad
  (T-027) es el único artefacto que ejercita el sistema
  end-to-end; el workflow de CI (T-028) es lo que hace
  que la suite corra en cada push. Separarlos
  significaría que los tests de seguridad llegan sin CI
  que los gatee, y CI llega sin los tests que gatea.
  Los docs + handoff redondean el cambio para que el
  reviewer pueda validar contra el spec y la proposal
  en una sola pasada. Un PR de ~700 líneas es el
  mínimo para enviar el cambio de forma segura.
- **Riesgo en PR 3**: por encima del presupuesto de
  400 líneas; el usuario ha aceptado explícitamente
  una estrategia de 3 PRs encadenados con un
  presupuesto de revisión por PR (auto-forecast). Si
  el reviewer empuja el tamaño hacia atrás, los docs
  (T-030 a T-032) se pueden partir en un PR de
  seguimiento sin romper la cadena.
- **Dirección de la dependencia**: PR 1 → PR 2 → PR 3,
  en ese orden. Cada PR apunta a `develop`. PR 1 es
  el piso: ningún otro slice puede aterrizar sin él.
  PR 2 es la superficie de aplicación: nada es
  testeable end-to-end sin ella. PR 3 es la
  verificación + handoff: nada se puede mergear sin
  ella.

Si el diff de un slice excede el presupuesto de 400
líneas en tiempo de apply, el worker DEBE pausar,
capturar los conteos de líneas reales, y reportar el
excedente en el log `apply-progress.md` para que el
parent pueda decidir si re-pronostica o si acepta el
excedente en ese PR puntual.

## Riesgos específicos del apply

Cada riesgo tiene una mitigación que vive dentro de una
tarea existente, no una tarea nueva.

| Riesgo | Vive en | Mitigación |
|---|---|---|
| `@node-rs/argon2` falla al instalar o cargar en la VM 1-CPU de Fly.io. | T-012 | El script de benchmark en T-012 es el smoke test. Si crashea, el fallback a `argon2` (npm) es un cambio de import de una línea en `argon2.hasher.ts`. El benchmark se re-corre y el resultado se registra en `apply-progress.md`. |
| Tiempo de hash Argon2id fuera del target 50–100 ms. | T-012, T-027 | El benchmark en T-012 se corre localmente; el test `argon2.parameters.test.ts` en T-027 lo re-corre en CI. Si el p50 del tiempo de hash está fuera de la banda, el parámetro `timeCost` se re-ajusta (1, 2 o 3) antes de marcar el PR como listo. |
| La superficie de la API beta de Auth.js v5 cambia entre la versión pineada y una beta posterior. | T-018 | La tarea de apply pinea la versión exacta `next-auth@5.0.0-beta.X` en `package.json` y usa `pnpm install --frozen-lockfile` en CI. Upgradear requiere una decisión explícita en un cambio posterior. |
| Drift de migración de Prisma en el free tier de Neon durante la fase de apply. | T-015 | La tarea de apply para la migración corre `pnpm prisma migrate dev` localmente primero, commitea el `migration.sql` generado, y corre `pnpm prisma migrate deploy` en el job de test de CI. El deploy es idempotente. |
| Credenciales de Google OAuth mal configuradas en el primer intento de sign-in. | T-023 | La tarea de apply para la página signIn de Auth.js tiene un paso de smoke test manual: sign-in con el cliente OAuth de test en dev antes de marcar la tarea como hecha. El test `oauth.state-csrf.test.ts` en T-027 verifica el camino de state-CSRF. |
| El catch-all de Hono matchea accidentalmente `/api/auth/*` y maneja doble los requests. | T-025 | La tarea de apply para el catch-all incluye un test de routing que prueba que `/api/auth/signin` va a Auth.js y `/api/me` va a Hono. El test asegura que ambas rutas devuelven sus formas esperadas desde el mismo server de Next.js. |
| El middleware origin-check bloquea POST legítimos cross-origin en dev. | T-021 | El default de `APP_URL` es `http://localhost:3000`. El test `origin-check.test.ts` en T-027 cubre los casos mismo-origen (permitido) y cross-origin (bloqueado). El formulario de signIn se monta en el mismo origen, así que los requests legítimos nunca se bloquean. |
| Evento `UserRegistered` dispatchado en el camino de auto-link. | T-014, T-027 | El evento se dispatcha en `AuthService.register` (T-014) para signups locales. El camino de auto-link (BR-AUTH-5) NO dispatcha `UserRegistered`. La tarea de apply incluye un test parametrizado en `auth.service.test.ts` que asegura que el evento se dispara exactamente una vez por usuario, nunca en auto-link. |
| Costo de inicialización de `DUMMY_HASH` de Argon2id en el primer request. | T-018 | `DUMMY_HASH` se genera al init del módulo (top-level `const DUMMY_HASH = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD)`). El primer request al callback de Credenciales es más lento en ~50–100 ms; los requests subsiguientes son rápidos. Aceptamos esto en MVP. |
| Índice de `Session.expires` agregado pero sin job de GC en este cambio. | T-015 | Documentado. El job de GC es un cambio separado; hasta entonces, las sesiones expiradas se acumulan. El lookup de `auth()` es por `sessionToken`, así que la falta de GC no afecta correctness, solo el tamaño de la DB. |
| `pnpm install --frozen-lockfile` falla en CI cuando `pnpm-lock.yaml` falta o está desincronizado. | T-028 | El job de `lint` en T-028 corre `pnpm install --frozen-lockfile` y falla rápido. El `package.json` tiene `"packageManager": "pnpm@<version>"` para que `corepack` aprovisione la versión correcta. |
| Drift de TDD estricto — el worker escribe la implementación antes que el test. | T-001 a T-033 | Cada tarea lista el archivo de test como primer sub-deliverable; las líneas `Tests` y `Verify` detallan el ciclo RED → GREEN → REFACTOR. `strictTdd.enabled: true` de `openspec/config.yaml` (actualizado en el commit de este cambio) expone la disciplina al reviewer. |
| El umbral de cobertura del 80 % de Vitest pasa silenciosamente con tests de baja calidad. | T-027 | La suite de seguridad (T-027) es el input adversarial: cada test de seguridad tiene un umbral estadístico documentado o una aserción hard-coded de DB. La cobertura es necesaria, no suficiente. |

## Fuera de alcance para este cambio

Lo siguiente está tracked en la proposal y el design
como cambios separados. El worker de `sdd-apply` NO
DEBE colar ninguno de estos en este slice.

- **Otros providers OAuth** (Apple, Facebook, GitHub).
  Trackeado como cambio post-MVP. El schema de Prisma
  ya soporta N providers por usuario; solo
  `provider = 'google'` se envía en MVP.
- **Flujos de password reset y verificación de email**.
  Trackeados como `auth-password-reset` y
  `email-verification`. La tabla `VerificationToken`
  existe en el schema (el schema canónico de Auth.js la
  incluye) pero no se usa. El password reset es una
  actualización manual de SQL por el operador en MVP.
- **Autenticación multi-factor**. Post-MVP.
- **Rate limiting en `/api/auth/callback/credentials`**.
  Trackeado como `security-rate-limiting`. La mitigación
  de user-enumeration del `authorize()` de Credenciales
  (BR-AUTH-4) está en alcance y se enforcea en T-018;
  el rate limiting es un cambio separado con sus
  propios criterios de aceptación.
- **Listado de sesiones y "log out all devices"**. El
  sign-out revoca solo la sesión actual (BR-AUTH-8).
  "Sign out everywhere" es un cambio separado.
- **RBAC genérico sobre `userId`**. Cada cambio
  posterior maneja su propia disciplina
  `WHERE user_id = ?`. No hay tabla `role` /
  `permission` en este cambio.
- **Pantallas de UI más allá de `auth/signin` y
  `auth/signout`**. El dashboard, la vista de cuentas, la
  vista de transacciones son de `ui-auth-shell` y
  cambios downstream. El contrato en este cambio es la
  API HTTP (Hono) + las dos páginas de Auth.js.
- **Linking on-demand de cuentas** ("Link Google to my
  account" desde settings). El flujo de auto-link en el
  primer login OAuth es el único camino de linking
  (BR-AUTH-5). Un UI manual de link/unlink es un cambio
  separado.
- **Acciones "Unlink Google" / "Set password" para
  usuarios existentes**. Cambio separado.
- **Poda de refresh tokens**. Las sesiones se acumulan
  en la DB hasta que un cambio separado las pode. El
  índice `Session.expires` en T-015 está en su lugar
  para soportar ese GC futuro.
- **Eliminación de usuarios y workflows de GDPR**.
  Trackeado como `user-deletion`. El
  `onDelete: Cascade` del schema de Prisma está en su
  lugar para soportarlo. No en alcance aquí.
- **Flujo de cambio de email**. `User.email` es
  inmutable en MVP (según la decisión aceptada del
  usuario gap 7: el cambio de email de Google no
  actualiza `User.email`; el camino conservador).
- **Notificaciones por email en auto-link**. Un pase
  futuro de hardening.
- **Deploy a Fly.io**. Trackeado como `fly-deploy`. El
  workflow de CI en T-028 corre en cada push; el
  `fly.toml`, `Dockerfile` y `fly secrets set` reales son
  separados. El benchmark de Argon2 en T-012 se re-corre
  en la VM destino en `fly-deploy` para confirmar el
  tiempo de hash de 50–100 ms.
- **Email de bienvenida en `UserRegistered`**. El evento
  se dispatcha (T-014); un worker downstream en un cambio
  posterior lo consume. Ningún consumer se envía en
  este cambio.

## Definition of done

El parent corre este checklist en tiempo de
`sdd-verify`. Cada caja debe estar marcada.

- [ ] Las 33 tareas marcadas `[x]`.
- [ ] `pnpm test` sale 0 a través de todo el
      repositorio.
- [ ] Cobertura ≥ 80 % en `src/modules/auth/**` y
      `src/shared/db/**` (líneas y ramas), medida por
      `pnpm test -- --coverage` y el umbral de
      `vitest.config.ts` en T-002.
- [ ] `pnpm run lint` sale 0.
- [ ] `pnpm run typecheck` sale 0.
- [ ] `pnpm run build` sale 0 (smoke test del build
      de producción de Next.js).
- [ ] `pnpm prisma migrate deploy` aplica la migración
      commiteada en una base de datos limpia.
- [ ] `gga run` sale 0 sobre el diff final.
- [ ] Revisión adversarial pasada (un subagent `reviewer`
      fresco auditó el diff con foco en: enumeración
      de usuarios en `authorize()` de Credenciales
      (BR-AUTH-4), material de password en logs
      (BR-AUTH-11), elección de parámetros Argon2id en
      la VM destino (BR-AUTH-3), modelo de seguridad
      del auto-link (BR-AUTH-5), unique constraint de
      `Account` y el caso de borde "OAuth subject
      linked to different email" (BR-AUTH-10), confianza
      en `email_verified` de Google (BR-AUTH-6), expiry
      de sesión y sliding window (BR-AUTH-7), tipado
      de Hono dentro de Next.js (sin tipos a nivel de
      ruta de Next.js para `/api/*`)). Los hallazgos
      del reviewer se registran en el verify-report.
- [ ] Los cuatro docs espejados (proposal, spec, design,
      tasks) — sin drift. `docs/architecture.md` y el
      espejo `Documents-es/docs/architecture.md`
      también están en sync.
- [ ] `README.md` actualizado con cómo correr localmente
      (y el espejo `Documents-es/README.md`).
- [ ] `.env.example` está completo (cada variable de
      entorno nombrada en el schema de env del design
      está presente con un placeholder y un comentario).
- [ ] Sin atribución de IA en ningún lado (commits,
      archivos, cuerpo del PR). `git log` muestra
      `Author: Sebastián Illa` en cada commit.
- [ ] Formato Conventional Commits a lo largo de todo.
- [ ] `git log --oneline feat/auth-foundation` muestra
      una historia lineal; sin merge commits dentro del
      slice.
- [ ] Los tres PRs encadenados están abiertos contra
      `develop` con `gh pr view` mostrando
      `mergeable: MERGEABLE` y CI verde. Cada PR se
      mergea solo después de su propio pase de reviewer;
      el siguiente PR se rebasa sobre el último
      `develop` antes de abrirse.
- [ ] `openspec/config.yaml` actualizado:
      `strictTdd.enabled: true` y
      `strictTdd.runner: "pnpm test"`.
- [ ] Los 8 decision gaps codificados como defaults (no
      como preguntas abiertas) en la lista de tareas:
      1. `@node-rs/argon2` (con fallback a `argon2`) —
         T-012.
      2. `memoryCost=19456, timeCost=2,
         parallelism=1` — T-012, T-027.
      3. El callback `signIn` actualiza `lastLoginAt` y
         emite `UserRegistered` solo en el primer
         registro — T-018, T-014.
      4. `lastLoginAt` actualizado en el callback
         `signIn`, no en lectura de session — T-018.
      5. Forma de exportación del cliente tipado de
         Hono (`OpenAPIHono` + `hc<typeof honoApp>` en
         `src/modules/api/client.ts`) — T-021, T-022.
      6. UX de `OAuthAccountNotLinked` en la página
         signIn custom — T-023.
      7. `User.email` no se actualiza en cambio de
         email de Google — T-018 (el callback `signIn`
         nunca muta `email`).
      8. Sliding window de 24 h, sesión expira a los
         30 días — T-018 (`session.maxAge` y
         `session.updateAge` de Auth.js).
