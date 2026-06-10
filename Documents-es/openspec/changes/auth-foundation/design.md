# Design — `auth-foundation`

**Autor**: Sebastián Illa
**Cambio**: `auth-foundation`
**Estado**: borrador · **Creado**: 2026-06-10
**Stack**: v2 — Next.js 16 + Auth.js v5 + Prisma 6 + PostgreSQL (Neon) + Hono catch-all + Zod
**Upstream**: `openspec/changes/auth-foundation/proposal.md` (v2, commiteado en `051e01e`)
**Spec**: `openspec/specs/auth/spec.md`

> **Nota v2**: esta es la segunda escritura de este design. La
> primera versión (commit `b562cee`) apuntaba a Bun + Hono
> (server) + Drizzle + SQLite + un subsistema de auth hecho a
> mano con JWTs emitidos por la app y refresh-token rotation
> con family revocation. v1 queda en el historial de git como
> referencia estructural; su contenido es **obsoleto** (JWT
> custom, refresh rotation, Drizzle, SQLite, `arctic`, `jose`,
> `bun-argon2`). v2 mantiene la *forma* de v1 (11 secciones:
> architecture overview, library decisions, config shape,
> catch-all shape, schema, migrations, env vars, testing, CI,
> open questions, risks) y reemplaza la *sustancia* por
> sesiones en base de datos vía Auth.js v5, el Prisma adapter,
> el Hono catch-all, y `@node-rs/argon2` (o `argon2` como
> fallback).

## 1. Architecture overview

El módulo `auth` sigue la **modular + clean architecture** del
proyecto (ver skill `architecture-standards`). La dirección
de dependencias es estricta: `UI → Application → Domain ←
Infrastructure`. La capa de dominio
(`src/modules/auth/domain/**`) no sabe nada de application,
infrastructure ni UI. La comunicación cross-module sucede
exclusivamente a través de `src/shared/events/` (los eventos
`UserRegistered` y `UserSignedIn`), nunca mediante imports
directos.

```mermaid
graph TD
  subgraph App["app/ (Next.js App Router)"]
    SIGNIN["/auth/signin<br/>(página Next.js)"]
    SIGNINHANDLER["/api/auth/[...nextauth]/route.ts<br/>Auth.js handlers"]
    CATCHALL["/api/[...path]/route.ts<br/>Hono catch-all"]
  end

  subgraph Hono["src/modules/api/ (Hono)"]
    H["honoApp<br/>(OpenAPIHono)"]
    HEALTH["GET /health"]
    ME["GET /me"]
    REG["POST /auth/register"]
  end

  subgraph AuthModule["src/modules/auth/"]
    subgraph Domain["domain/"]
      USER["entities/user.ts"]
      ACCT["entities/account.ts"]
      SESS["entities/session.ts"]
      SVC["services/auth.service.ts"]
      PORTS["interfaces/<br/>{user,session,account}.port.ts"]
    end
    subgraph Application["application/"]
      ACTIONS["actions/<br/>{register,me,health}.action.ts"]
      DTO["dto/<br/>{register,me,health}.dto.ts"]
    end
    subgraph Infra["infrastructure/"]
      REPOS["repositories/<br/>{user,account,session}.repository.ts"]
      ARGON["external/<br/>argon2.hasher.ts"]
      AUTHJS["external/<br/>authjs.ts (auth())"]
    end
  end

  subgraph Shared["src/shared/"]
    DB["db/<br/>prisma client"]
    ENV["env/<br/>zod env schema"]
    EVT["events/<br/>event dispatcher"]
    LOG["logger/<br/>structured logger"]
  end

  SIGNINHANDLER --> AUTHJS
  AUTHJS --> PORTS
  AUTHJS --> REPOS
  REPOS --> DB
  AUTHJS --> ARGON
  AUTHJS --> SVC
  SVC --> PORTS
  ACTIONS --> SVC
  ACTIONS --> DTO
  ACTIONS --> EVT
  ACTIONS --> LOG
  CATCHALL --> H
  H --> HEALTH
  H --> ME
  H --> REG
  H --> AUTHJS
  ACTIONS --> AUTHJS
  SIGNIN -.UI only.-> SIGNINHANDLER
```

**Responsabilidades por capa:**

- **`app/`** (UI) — Páginas, layouts, server components del
  Next.js App Router, y los dos route handlers de API. No es
  dueña de lógica de negocio. Llama a las application actions y
  a los handlers de Auth.js.
- **`src/modules/api/`** (UI-shaped) — Instancia
  `OpenAPIHono` de Hono que expone la superficie `/api/*` (no
  auth). Montada en `app/api/[...path]/route.ts`. Llama a las
  application actions.
- **`src/modules/auth/`** (el módulo `auth`) — domain
  (entities, services, ports), application (actions, DTOs),
  infrastructure (repositories, wrapper de Argon2id, config
  de Auth.js).
- **`src/shared/`** — Infraestructura cross-cutting: Prisma
  client, env schema (Zod), event dispatcher in-process,
  logger estructurado.

**Dirección de dependencias en código:**

```text
UI (app/, src/modules/api/) → Application (src/modules/auth/application) → Domain (src/modules/auth/domain) ← Infrastructure (src/modules/auth/infrastructure + src/shared/db)
```

El handler de Auth.js en
`app/api/auth/[...nextauth]/route.ts` llama a `auth()` desde
`src/modules/auth/infrastructure/authjs.ts`, que internamente
cablea el Prisma adapter a nuestros domain ports. Las
application actions en `src/modules/auth/application/` las
llaman los handlers de Hono en `src/modules/api/` y cualquier
server component en `app/` que necesite el usuario actual.

**API pública del módulo** (`src/modules/auth/index.ts`):

- `auth()` — Helper server-side de Auth.js v5.
- `signIn`, `signOut` — server actions de Auth.js.
- `handlers` — `GET` y `POST` para `/api/auth/*`, montados en
  `app/api/auth/[...nextauth]/route.ts`.
- `honoApp` — La instancia `OpenAPIHono` para las rutas
  `/api/*` (no-auth), exportada para consumo tipado por la UI.
- Constantes de nombres de eventos `UserRegistered` y
  `UserSignedIn`.

## 2. Decisiones de librerías

Cada decisión es una subsección estilo ADR: chosen,
alternatives, rationale, link a la(s) regla(s) que satisface.

### Auth.js v5 (`next-auth@5.0.0-beta.X`)

- **Elegido por** — OAuth (Google) + Credentials + sesiones
  en base de datos en una sola librería. Soporte first-class
  para Next.js App Router, helper server-side `auth()`, y un
  Prisma adapter mantenido.
- **Pin**: versión exacta `next-auth@5.0.0-beta.X` (sin
  caret, sin tilde). La versión queda capturada en
  `dependencies` de `package.json` y enforced por
  `pnpm install --frozen-lockfile` en CI.
- **Alternativas**:
  - **Lucia** — rechazada. Lucia es de más bajo nivel y
    nos obligaría a construir el flujo OAuth, la resolución
    de sesión y la protección CSRF nosotros mismos. Auth.js
    nos da las tres out of the box.
  - **Clerk** — rechazada. SaaS con vendor lock-in, costo
    mensual por MAU, y los datos viven en la infra de
    Clerk. Somos dueños de la base Postgres; la capa de
    identidad vive con ella.
  - **Supabase Auth** — rechazada. Nos hubiera empujado
    hacia Supabase Postgres y su modelo de row-level
    security. El stack es Neon + Prisma; Auth.js encaja de
    forma nativa.
  - **OAuth + JWT hechos a mano** — rechazada. Esa
    superficie (callback OAuth custom, refresh-token
    rotation custom, firmado de JWT a mano) es demasiado
    grande para un solo cambio; canjeamos código custom
    por una librería battle-tested.
- **Nota de status**: `next-auth@beta` es la versión que
  todos usan en 2026 pese a estar oficialmente en beta.
  Mitigación: pinear la versión exacta, mirar los
  releases, planear el upgrade a stable cuando salga.
- **Driver de la decisión**: BR-AUTH-5, BR-AUTH-6,
  BR-AUTH-7, BR-AUTH-8, BR-AUTH-10 (el OAuth y el manejo
  de sesión de Auth.js cubren todos ellos).

### `@auth/prisma-adapter`

- **Elegido por** — el Prisma adapter oficial para Auth.js
  v5. El adapter es dueño del schema (User, Account,
  Session, VerificationToken) y de los paths de read/write
  entre Auth.js y la base.
- **Alternativas** — ninguna práctica. El Prisma adapter es
  el único adapter de Postgres soportado por Auth.js v5 con
  mantenimiento oficial. Se consideraron adapters custom y
  se rechazaron (re-implementaríamos el schema y los hooks).
- **Driver de la decisión**: BR-AUTH-7, BR-AUTH-8 (la
  tabla `Session` y el patrón de read en cada request), y
  el compromiso "Auth.js + Prisma adapter" de la propuesta.

### Librería de Argon2id — `@node-rs/argon2` (con fallback `argon2`)

- **Elegido**: `@node-rs/argon2` — binarios NAPI prebuilt
  para Alpine (`node:20-alpine`), sin paso de `node-gyp` al
  instalar, rápido en Node 20. El paquete lo mantiene la
  org `@node-rs` y se usa mucho en el ecosistema Node en
  2026.
- **Fallback**: `argon2` (el paquete npm hermano del autor
  de `@node-rs/argon2`, el binding canónico de Node). Se
  usa solo si el prebuilt de `@node-rs/argon2` falla al
  cargar en la VM 1-CPU de Fly.io. Ambos exponen la misma
  superficie de primitivas (`hash`, `verify`,
  `Algorithm.Argon2id`), así que el swap de fallback es un
  cambio de import de una línea.
- **Rechazadas**:
  - `bcrypt` — fuera de alcance por la propuesta.
    BR-AUTH-3 nos compromete con Argon2id; bcrypt es
    anterior al requisito de memory-hardness.
  - `argon2-browser` (pure-JS) — demasiado lento al set de
    parámetros que queremos. Buscamos 50–100 ms por hash en
    Fly.io 1-CPU; pure-JS no llega.
  - scrypt hecho a mano — rechazado. scrypt es aceptable
    en aislamiento, pero la propuesta es explícita sobre
    Argon2id. Ninguna evidencia nueva en la propuesta
    soporta un swap.
- **Driver de la decisión**: BR-AUTH-3 (Argon2id
  únicamente, target 50–100 ms en Fly.io 1-CPU). La
  elección de la librería se finaliza en la fase de apply
  vía el gate de benchmark descrito en §8.

### Prisma 6

- **Elegido por** — schema tipado (la única fuente de
  verdad del modelo de datos), migraciones versionadas
  (`prisma migrate dev` / `prisma migrate deploy`), y
  soporte first-class de Neon (Neon trae un conector
  Prisma y un connection pooler que Prisma 6 sabe usar).
- **Alternativas**:
  - **Kysely** — demasiado bajo nivel; el costo de
    escribir el schema en dos lados (tipos TS + migrations)
    supera las ganancias.
  - **SQL crudo + node-postgres** — rechazado. El módulo
    auth es lo bastante chico como para zafar, pero las
    otras capabilities (accounts, transactions, snapshots)
    no, y queremos un ORM consistente entre todas.
- **Driver de la decisión**: propuesta §What (Prisma 6
  explícito); skill `database-strategy` (ORM para
  abstracción, migraciones versionadas, repositorios en la
  capa de infrastructure).

### Hono (catch-all de aplicación)

- **Elegido por** — TypeScript first-class, runtime
  liviano, integración limpia con Next.js como route
  handler, y la extensión `OpenAPIHono` para export de
  cliente tipado. La UI consume el cliente tipado y obtiene
  type safety end-to-end desde la ruta de servidor al fetch
  del browser.
- **Alternativas**:
  - **Route handlers puros de Next.js** (ej. archivos
    `route.ts` por endpoint) — rechazado. Queremos un
    único catch-all con una app de Hono adentro, y las
    primitivas de routing de Hono (middleware, context,
    validators) calzan mejor con la amplitud de endpoints
    que esperamos (este cambio envía 3; los cambios
    siguientes agregan `/api/accounts/*`,
    `/api/transactions/*`, etc.).
  - **tRPC** — rechazado. tRPC es genial para codebases
    cliente/servidor tightly-coupled, pero la superficie
    de API que eventualmente queremos (clientes móviles,
    integraciones de terceros) es HTTP+JSON, no tRPC.
    Hono + `OpenAPIHono` se acerca más a eso.
  - **Fastify** — rechazado. No necesitamos el ecosistema
    de plugins; la superficie de Hono es más chica y
    TS-first.
- **Driver de la decisión**: propuesta §Implications and
  impact (Hono montado como único catch-all en
  `app/api/[...path]/route.ts`); skill `api-design`
  (convenciones REST, formato de response, status codes).

### Zod

- **Elegido por** — validación de env al arranque
  (`src/shared/env/env.schema.ts`), validación de body de
  request en cada frontera de acción Hono, y como fuente de
  verdad para los DTOs de las rutas
  (`src/modules/auth/application/dto/`).
- **Alternativas**:
  - **Valibot** — considerada. Más liviano y modular, pero
    el ecosistema (el `@hono/zod-validator` de Hono,
    generadores de OpenAPI, formateadores de mensaje de
    error) es más maduro alrededor de Zod. El argumento de
    bundle size es débil para un proyecto server-only.
  - **TypeBox** — considerada. Inferencia de tipos
    poderosa, pero las ergonomías de API alrededor de
    parseo y formato de error no son tan amables para
    nuestro caso de uso.
- **Driver de la decisión**: skill `env-config` (Zod env
  schema al arranque); skill `api-design` (validación de
  body de request); skill `error-handling`
  (`VALIDATION_ERROR` carga la lista de issues de Zod como
  `details`).

### Neon (Postgres)

- **Elegido por** — el free tier (0.5 GB), branching (DB
  per-PR con un click para tests y previews), driver
  serverless (sin connection pooler que mantener), y
  soporte first-class de Prisma.
- **Alternativas**:
  - **Supabase** — rechazada. Nos hubiera empujado hacia
    Supabase Auth y su row-level security. El stack es
    Auth.js + Prisma.
  - **Postgres local en dev** — se mantiene para la suite
    de integration tests (Vitest levanta un container de
    Postgres vía testcontainers), pero la base de
    dev/staging/prod es Neon.
  - **Railway Postgres** — equivalente. Elegimos Neon
    porque el workflow de branching es la killer feature
    para nuestra historia de test environment por PR.
- **Driver de la decisión**: propuesta §What (Neon
  explícito), free tier + branching para PRs y el trabajo
  de security review que vive en el subagent `judge`.

### Fly.io (deploy)

- **Elegido por** — el free tier (1 shared-cpu-1x VM en
  region `eze` Buenos Aires), deployments persistentes de
  Docker, manejo de secrets, y `fly secrets` para las env
  vars de Auth.js.
- **Alternativas**:
  - **Vercel** — rechazada. Vercel corre Next.js en su
    propio runtime, pero el cambio `fly-deploy` (aparte)
    quiere una imagen Docker multi-stage con el Prisma
    client horneado adentro. El modelo serverless de
    Vercel es una superficie diferente.
  - **Render** — equivalente. Elegimos Fly.io porque la
    lista de regiones incluye `eze` (Buenos Aires), que
    matchea el target de latencia del proyecto para un
    usuario basado en Argentina.
- **Driver de la decisión**: propuesta §Stack v2 (Fly.io
  explícito); skill `deployment` (Dockerfile multi-stage,
  health check, container stateless). El cambio
  `fly-deploy` es dueño del `fly.toml` real y del workflow
  de GitHub Actions.

## 3. Configuración de Auth.js v5

El archivo `auth.ts` en la raíz del repo (o
`src/modules/auth/infrastructure/authjs.ts`, re-exportado)
configura Auth.js v5 con el Prisma adapter, el provider
Google y el provider Credentials.

```ts
// src/modules/auth/infrastructure/authjs.ts
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Google from 'next-auth/providers/google';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/shared/db/prisma';
import { env } from '@/shared/env/env';
import { verifyArgon2id, hashArgon2id } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { z } from 'zod';

// --- Validación del input de Credentials authorize() ---
const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128), // El chequeo de largo es BR-AUTH-2 en register; acá precisamos un string.
});

// Un dummy hash fijo usado para igualar el timing cuando el
// usuario no se encuentra o no tiene passwordHash (BR-AUTH-4,
// BR-AUTH-9). Se genera una vez al init del módulo vía
// hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD) y se cachea. El
// string plano nunca se loguea.
const DUMMY_HASH: string = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD);

export const authConfig: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'database' },
  secret: env.AUTH_SECRET,
  pages: {
    signIn: '/auth/signin',    // montada por el cambio ui-auth-shell
    signOut: '/auth/signout',  // igual
  },
  providers: [
    Google({
      clientId: env.AUTH_GOOGLE_ID,
      clientSecret: env.AUTH_GOOGLE_SECRET,
      authorization: {
        params: {
          prompt: 'select_account',
          scope: 'openid email profile',
        },
      },
    }),
    Credentials({
      name: 'credentials',
      credentials: {
        email: { type: 'email' },
        password: { type: 'password' },
      },
      async authorize(credentials) {
        // 1. Validación Zod en la frontera de la acción.
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();

        // 2. Buscar el usuario.
        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
        });

        // 3. Igualación de timing (BR-AUTH-4, BR-AUTH-9).
        // Si el usuario falta o no tiene passwordHash, igual
        // corremos un verify de Argon2id contra el dummy hash
        // para que el tiempo de respuesta sea estadísticamente
        // indistinguible del camino "encontrado, password
        // incorrecta".
        if (!user || !user.passwordHash) {
          await verifyArgon2id(DUMMY_HASH, password);
          return null;
        }

        // 4. Verificar la password.
        const ok = await verifyArgon2id(user.passwordHash, password);
        if (!ok) return null;

        // 5. Devolver el user object que Auth.js conoce.
        // Devolvemos solo `id`, `email`, `name`, `image`.
        // `defaultProvider` y `lastLoginAt` los tilda el
        // callback signIn de abajo.
        return {
          id: user.id,
          email: user.email,
          name: user.name ?? null,
          image: user.image ?? null,
        };
      },
    }),
  ],
  callbacks: {
    // signIn corre después de que el authorize() de
    // Credentials devuelve OK, o después de que el callback
    // OAuth de Google resuelve. Lo usamos para tildar
    // lastLoginAt y (en el primer registro) defaultProvider
    // (BR-AUTH-13).
    async signIn({ user, account, profile }) {
      if (!user?.id) return false;
      await prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
          // defaultProvider se setea solo en el primer
          // registro. Detectamos "primer registro"
          // chequeando si lastLoginAt era null antes del
          // update. El update de Prisma con `data: {
          // lastLoginAt: new Date() }` sobre una fila que
          // antes tenía lastLoginAt = null no cambia
          // defaultProvider. Un code path separado en la
          // acción UserRegistered setea defaultProvider en
          // el primer insert.
        },
      });
      return true;
    },
    // session corre en cada llamada a auth(). Agregamos
    // `defaultProvider` y `lastLoginAt` al JSON de sesión
    // para que la UI los pueda renderizar vía /api/me y vía
    // useSession() en el cliente.
    async session({ session, user }) {
      if (session.user && user?.id) {
        session.user.id = user.id;
        // La fila User de Prisma carga defaultProvider y
        // lastLoginAt; la estrategia database session de
        // Auth.js v5 nos da el argumento `user` populado
        // desde la tabla User, así que podemos leer ambos
        // campos directo.
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { defaultProvider: true, lastLoginAt: true },
        });
        if (dbUser) {
          (session.user as any).defaultProvider = dbUser.defaultProvider;
          (session.user as any).lastLoginAt = dbUser.lastLoginAt;
        }
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
```

Los `handlers` se montan en
`app/api/auth/[...nextauth]/route.ts`:

```ts
// app/api/auth/[...nextauth]/route.ts
export { GET, POST } from '@/modules/auth/infrastructure/authjs';
```

(Donde `GET` y `POST` son los `handlers.GET` y `handlers.POST`
re-exportados por el módulo `authjs.ts` de arriba, o
destructurados en el call site. El pseudocódigo muestra la
intención; la forma exacta del export se finaliza en la
fase de apply.)

**Notas sobre las decisiones de diseño de arriba:**

- El callback `signIn` tilda `lastLoginAt` en cada sign-in
  exitoso. `defaultProvider` se setea SOLO en la acción
  `POST /api/auth/register` (para signups locales) y
  dentro del callback OAuth para signups de Google la
  primera vez. El callback `signIn` nunca cambia
  `defaultProvider` (BR-AUTH-13).
- El callback `session` agrega `defaultProvider` y
  `lastLoginAt` al JSON de sesión. El endpoint
  `GET /api/me` de Hono también lee de la DB (es
  server-side y re-resuelve el user), así que el callback
  `session` es sobre todo para client components que usan
  `useSession()`.
- El `authorize()` de Credentials corre un verify de
  Argon2id contra `DUMMY_HASH` cuando el usuario no se
  encuentra. `DUMMY_HASH` se genera una vez al init del
  módulo desde `env.ARGON2ID_DUMMY_PASSWORD` (un string
  random largo seteado como Fly secret, nunca logueado).
  La llamada a verify tarda lo mismo que un verify real,
  igualando la forma y el timing de la respuesta
  (BR-AUTH-4, BR-AUTH-9).
- El `authorize()` devuelve los cuatro campos que Auth.js
  conoce: `id`, `email`, `name`, `image`. Auth.js no
  guarda `defaultProvider` ni `lastLoginAt` en el user
  object que maneja; los leemos de la DB en el callback
  `session` y en `GET /api/me`.

## 4. Forma del Hono catch-all

El Hono catch-all vive en
`app/api/[...path]/route.ts` y delega a la `honoApp`
exportada desde `src/modules/api/app.ts`.

```ts
// app/api/[...path]/route.ts
import { honoApp } from '@/modules/api/app';
import type { NextRequest } from 'next/server';

const handler = (req: NextRequest) => honoApp.fetch(req);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

La app de Hono:

```ts
// src/modules/api/app.ts
import { OpenAPIHono } from '@hono/zod-openapi';
import { auth } from '@/modules/auth'; // Helper de Auth.js
import { registerAction } from '@/modules/auth/application/actions/register.action';
import { meAction } from '@/modules/auth/application/actions/me.action';
import { healthAction } from '@/modules/auth/application/actions/health.action';
import { originCheck } from '@/modules/api/middlewares/origin-check';
import { env } from '@/shared/env/env';

export const honoApp = new OpenAPIHono();

// --- Middleware: resolver sesión y adjuntar user al context. ---
honoApp.use('*', async (c, next) => {
  const session = await auth();
  c.set('user', session?.user ?? null);
  c.set('session', session ?? null);
  await next();
});

// --- Health: público, sin auth. ---
honoApp.get('/health', (c) => healthAction(c));

// --- Me: requiere sesión válida. ---
honoApp.get('/me', (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, 401);
  }
  return meAction(c, user);
});

// --- Register: muta estado, requiere Origin check. ---
honoApp.post('/auth/register', originCheck(env.APP_URL), (c) => registerAction(c));
```

**Auth.js NO se enruta a través de Hono.** Auth.js es dueño
de `/api/auth/*` y se monta en
`app/api/auth/[...nextauth]/route.ts`. El catch-all de Hono
en `app/api/[...path]/route.ts` NO matchea `/api/auth/*`
porque el file-based routing de Next.js resuelve primero la
ruta más específica `app/api/auth/[...nextauth]/route.ts`.
Las dos superficies son hermanas:

```text
app/api/
├── auth/[...nextauth]/route.ts   # Auth.js (handlers.GET, handlers.POST)
└── [...path]/route.ts            # Hono (honoApp.fetch)
```

**Middleware `origin-check`** para endpoints que mutan
estado:

```ts
// src/modules/api/middlewares/origin-check.ts
import type { MiddlewareHandler } from 'hono';

export function originCheck(allowedOrigin: string): MiddlewareHandler {
  return async (c, next) => {
    if (c.req.method === 'GET' || c.req.method === 'HEAD') return next();
    const origin = c.req.header('Origin');
    if (!origin || new URL(origin).origin !== new URL(allowedOrigin).origin) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request blocked' } }, 403);
    }
    return next();
  };
}
```

En MVP, `POST /api/auth/register` es el único endpoint que
muta estado. Los cambios siguientes agregan más; cada uno
pasa por el mismo middleware `originCheck`.

**`OpenAPIHono` y export de cliente tipado.** La app de Hono
es una instancia `OpenAPIHono`, lo que significa que podemos:

1. Servir el spec de OpenAPI en `/api/doc` (solo debug, detrás
   de `env.NODE_ENV !== 'production'`).
2. Generar un cliente tipado (`hc<typeof honoApp>`) para uso
   desde la UI en el cambio `ui-auth-shell`.

El cliente tipado se exporta desde
`src/modules/api/index.ts` junto a la instancia `honoApp`.

## 5. Prisma schema

El `prisma/schema.prisma` completo para los modelos
relacionados con auth. Esta es la única fuente de verdad del
modelo de datos. Las otras capabilities (accounts,
transactions, etc.) agregan sus propios modelos en cambios
posteriores; los modelos de auth son estables a partir de
este cambio.

```prisma
// prisma/schema.prisma

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// --- Modelos canónicos del Auth.js Prisma adapter ---
// Fuente: https://authjs.dev/reference/adapter/prisma
// Tres columnas agregadas a User por encima del schema canónico:
//   - passwordHash     (BR-AUTH-3, BR-AUTH-9)
//   - defaultProvider  (BR-AUTH-13)
//   - lastLoginAt      (tildado por el callback signIn)

model User {
  id              String    @id @default(cuid())
  name            String?
  email           String    @unique
  emailVerified   DateTime?
  image           String?

  // --- Adiciones por encima del schema canónico de Auth.js ---
  passwordHash    String?
  defaultProvider String    @default("local")
  lastLoginAt     DateTime?

  accounts        Account[]
  sessions        Session[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([createdAt]) // para queries bulk del cambio user-deletion
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

  @@index([expires]) // para el job periódico de GC
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}
```

**Decisiones de índices** (y el porqué):

- `User.email` es `@unique`. La query `findUnique` en
  `authorize()` es el patrón de acceso primario. La
  comparación es case-insensitive por convención de
  aplicación; la aplicación hace lowercase al escribir.
- `User.createdAt` recibe un `@@index` explícito para la
  query bulk "users creados antes de N" del cambio
  `user-deletion`.
- `Account(provider, providerAccountId)` es `@@unique` —
  BR-AUTH-10. Esta es la única línea de defensa contra el
  ataque "misma cuenta de Google vinculada a dos users".
- `Session.sessionToken` es `@unique`. El patrón de acceso
  primario es `findUnique({ where: { sessionToken } })` en
  cada llamada a `auth()`.
- `Session.expires` recibe un `@@index` explícito para el
  job periódico de "garbage-collect de sesiones expiradas"
  (un cambio aparte). El lookup de `auth()` es por
  `sessionToken`, no por `expires`, así que este índice es
  solo para el path de GC.
- `Account.userId` y `Session.userId` están indexados
  implícitamente por la relación de foreign key. Prisma
  crea el índice en la columna de foreign key
  automáticamente.

**Comportamiento de cascada:**

- `Account.user` y `Session.user` usan
  `onDelete: Cascade`. Cuando se borra un `User` (en el
  cambio `user-deletion`), todas las filas de `Account` y
  `Session` de ese user se eliminan por Postgres en la
  misma transacción.
- `VerificationToken` no tiene relación con `User`; los
  tokens se identifican por el string `identifier`. El
  cambio `user-deletion` limpia los tokens explícitamente.

**Lo que la aplicación NUNCA escribe a mano:** El
Auth.js adapter es dueño de los paths de read/write para
`Account`, `Session` y `VerificationToken`. El código de
aplicación escribe en `User` solo vía el Prisma client.
Específicamente, la aplicación NUNCA:

- Inserta una fila de `Session` directamente. Auth.js lo
  hace.
- Actualiza una `Session.expires` directamente. Auth.js lo
  hace vía la extensión de sliding window.
- Borra una fila de `Session` directamente. El sign-out
  de Auth.js lo hace (BR-AUTH-8).
- Inserta una fila de `Account` directamente. El callback
  OAuth de Auth.js lo hace (BR-AUTH-5, BR-AUTH-10).
- Inserta una fila de `VerificationToken` directamente. El
  cambio `email-verification` será dueño; por ahora, la
  tabla está vacía.

## 6. Migraciones

La herramienta de migraciones versionadas de Prisma
maneja el schema. Localmente: `pnpm prisma migrate dev
--name auth_foundation` genera y aplica la migración. En
el pipeline de CI/deploy: `pnpm prisma migrate deploy`
corre en el arranque del container (decisión final
diferida al cambio `fly-deploy`; o bien un hook de
arranque o bien un release command de Fly).

El único archivo de migración que produce este cambio:

```text
prisma/migrations/
└── 20260610000000_auth_foundation/
    └── migration.sql
```

La migración crea las cuatro tablas (`User`, `Account`,
`Session`, `VerificationToken`) y todos los índices
listados en §5. La genera `prisma migrate dev` desde el
schema de §5; NO escribimos el SQL a mano (per skill
`database-strategy`: "el schema es la fuente de verdad, la
migración se genera").

**Comandos de migración:**

| Comando | Cuándo | Notas |
|---------|--------|-------|
| `pnpm prisma migrate dev --name <name>` | Desarrollo local | Genera + aplica. Resetea la DB si hay drift. |
| `pnpm prisma migrate deploy` | CI / arranque del container | Aplica migraciones pendientes. Idempotente. |
| `pnpm prisma generate` | Después de cualquier cambio de schema | Regenera el Prisma client tipado. |
| `pnpm prisma studio` | Debugging local | GUI. No se usa en CI. |

**Integración con CI** se describe en §9. El job `test`
levanta un Postgres fresco (vía testcontainers o una
branch de Neon) y corre `prisma migrate deploy` antes de
la suite de Vitest.

**Down-migrations** no entran en MVP. Si necesitamos
rollback, enviamos una migración de forward-fix. El
cambio `fly-deploy` puede agregar un runbook de rollback,
pero el schema en sí no carga down-migrations.

## 7. Variables de entorno

Validadas al arranque con un schema Zod (per skill
`env-config`). Cualquier valor faltante o malformado falla
rápido con un error claro. El schema vive en
`src/shared/env/env.schema.ts` y se parseea al init del
módulo; el objeto `env` resultante se exporta y lo usa
cada módulo.

```ts
// src/shared/env/env.schema.ts
import { z } from 'zod';

const envSchema = z.object({
  // --- Runtime ---
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // --- Database ---
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // --- Auth.js v5 ---
  // Auth.js lee AUTH_SECRET (su propio secret de firmado de
  // cookies). Debe ser de al menos 32 bytes. Enforce min(32)
  // sobre el string crudo y dejamos que el runtime haga el
  // resto.
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 bytes'),
  // URL pública de la app. Se usa para construir el callback
  // de OAuth y para la allowlist de origin-check de Hono.
  AUTH_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:3000'),

  // --- Provider Google ---
  AUTH_GOOGLE_ID: z.string().min(1, 'AUTH_GOOGLE_ID is required'),
  AUTH_GOOGLE_SECRET: z.string().min(1, 'AUTH_GOOGLE_SECRET is required'),

  // --- Argon2id ---
  // Un string random largo usado para sembrar el DUMMY_HASH
  // para igualación de timing en la función authorize() de
  // Credentials (BR-AUTH-4, BR-AUTH-9). Se genera una vez y
  // se guarda como Fly secret. Nunca se loguea.
  ARGON2ID_DUMMY_PASSWORD: z
    .string()
    .min(32, 'ARGON2ID_DUMMY_PASSWORD must be at least 32 bytes'),

  // --- Fly.io (opcional) ---
  FLY_REGION: z.string().optional(),
});

export const env = envSchema.parse(process.env);
```

**Validación cross-field** (vive en el módulo env, no en
las reglas per-field de Zod): al arranque assertamos que
`new URL(env.AUTH_URL).origin === new URL(env.APP_URL).origin`.
Un mismatch se loguea a `error` y el proceso sale con 1.
Esto captura la misconfiguración más común de "el callback
de OAuth anda en dev pero falla en prod" en el boot, no en
el primer round trip OAuth.

**`.env.example`** (commiteado) carga las mismas keys con
valores vacíos, excepto `AUTH_URL` y `APP_URL` que
defaultan a `http://localhost:3000` y `LOG_LEVEL` que
defaultea a `info`. `.env` y `.env.production` están en
`.gitignore`. Los secrets de producción viven en `fly
secrets` (encrypted at rest).

**Desarrollo local:**

```bash
# .env (gitignored)
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/gastos_dev
AUTH_SECRET=<openssl rand -base64 32>
AUTH_URL=http://localhost:3000
APP_URL=http://localhost:3000
AUTH_GOOGLE_ID=<de Google Cloud Console>
AUTH_GOOGLE_SECRET=<de Google Cloud Console>
ARGON2ID_DUMMY_PASSWORD=<openssl rand -base64 32>
```

**Producción (Fly.io):**

```bash
fly secrets set \
  DATABASE_URL=<neon-pooled-url> \
  AUTH_SECRET=<openssl rand -base64 32> \
  AUTH_URL=https://gastos-personales.fly.dev \
  APP_URL=https://gastos-personales.fly.dev \
  AUTH_GOOGLE_ID=<de Google Cloud Console> \
  AUTH_GOOGLE_SECRET=<de Google Cloud Console> \
  ARGON2ID_DUMMY_PASSWORD=<openssl rand -base64 32>
```

El cambio `fly-deploy` es dueño del comando `fly secrets
set` real y del orden en que se aprovisionan los secrets.

## 8. Estrategia de testing

Per skill `testing-standards`: patrón AAA, sin
`if`/`else`/`for` dentro de los bodies de tests,
parametrizado donde se necesita, ≥80 % de cobertura line
+ branch en el módulo `auth` (domain + application). TDD
estricto: los tests se escriben antes de la implementación
que pinean. Test runner: **Vitest** (la propuesta se
compromete con `pnpm test`; Vitest es el default TS y anda
limpio con ESM + pnpm).

> **Nota sobre la referencia a `bun test` en todo el
> proyecto** en `openspec/config.yaml`: esa línea es un
> residuo de v1. El stack v2 es Node + pnpm, así que el
> runner es `pnpm test` (Vitest debajo). El valor de
> `strictTdd.runner` se actualiza en la fase de apply de
> `auth-foundation` cuando se commitea la config de Vitest.

### Unit tests (domain services + wrappers de infrastructure)

Ubicados en `src/modules/auth/domain/**/*.test.ts` y
`src/modules/auth/infrastructure/external/*.test.ts`.
Funciones puras, sin DB, sin HTTP.

| Suite                                | Qué cubre                                                                                             |
|--------------------------------------|--------------------------------------------------------------------------------------------------------|
| `argon2.hasher`                      | `hashArgon2id` y `verifyArgon2id` con los parámetros elegidos; rechaza passwords incorrectas; verify devuelve `false` ante un hash tamperado. |
| `email.normalize`                    | Lowercase + trim; saca whitespace alrededor; rechaza vacío. |
| `default-provider` (servicio de dominio) | Devuelve `"local"` para users creados por la acción `register`; devuelve `"google"` para signups de Google la primera vez; NO cambia en sign-ins subsiguientes (BR-AUTH-13). |
| `user.repository` (mock in-memory)   | `create`, `findByEmail`, `findById`, lookup case-insensitive. |
| `account.repository` (mock in-memory)| `create` honra la restricción unique sobre `(provider, providerAccountId)`. |
| `session.repository` (mock in-memory)| `create`, `findByToken`, `delete` (sign-out). |

### Integration tests (Hono + Prisma + Postgres)

Ubicados en
`src/modules/auth/infrastructure/repositories/*.repository.test.ts`
y `src/modules/api/**/*.test.ts`. La base de test es un
container de Postgres por suite (testcontainers) o una
branch de Neon por corrida de CI. No mockeamos los
repositorios en integration tests; mockeamos solo las
fronteras externas (endpoint de userinfo de Google, el
reloj del sistema).

| Suite                                | Qué cubre                                                                                          |
|--------------------------------------|-----------------------------------------------------------------------------------------------------|
| `user.repository` (Prisma real)      | `create`, `findByEmail` (case-insensitive), `update` (lastLoginAt, defaultProvider). |
| `account.repository` (Prisma real)   | `create`, unique-violation sobre `(provider, providerAccountId)` duplicado. |
| `session.repository` (Prisma real)   | `create`, `findByToken`, `delete`. |
| `register.action`                    | 201 éxito; 409 `EMAIL_TAKEN` con timing comparable; 400 `WEAK_PASSWORD`; 400 `VALIDATION_ERROR`. Emite `UserRegistered` exactamente una vez. |
| `me.action`                          | 200 con `PublicUser` (sin `passwordHash`, sin `emailVerified`); 401 `UNAUTHORIZED` sin sesión, sesión expirada, usuario desconocido — forma idéntica. |
| `health.action`                      | 200 con `{ status: "ok", version, uptime }`. |
| `hono.catch-all`                     | Mount + dispatch: `GET /api/me` devuelve 200 con sesión, 401 sin; `POST /api/auth/register` 201, 409, 400; `GET /api/health` 200. |
| `oauth-callback.flow` (Google mockeado) | Auto-link por match de email (BR-AUTH-5); user nuevo en el primer email; `OAuthAccountNotLinked` en conflicto `(provider, providerAccountId)` (BR-AUTH-10); rechaza con `email_verified: false` (BR-AUTH-6). |

### Security tests

Ubicados en `src/modules/auth/__tests__/security/*.test.ts`.
Son integration tests pero viven en una carpeta dedicada
para que el reviewer los pueda auditar de una pasada.

| Test                                  | Qué prueba                                                                                          |
|---------------------------------------|-----------------------------------------------------------------------------------------------------|
| `login.timing.test.ts`                | El tiempo de respuesta para "email no encontrado" es estadísticamente indistinguible de "password incorrecto" y de "usuario solo-Google" (BR-AUTH-4, BR-AUTH-9). Sample size y threshold documentados en el test. |
| `oauth.state-csrf.test.ts`            | Un callback con un parámetro `state` faltante, malformado o expirado lo rechaza Auth.js; no se crea ningún `User`; no se inserta ninguna fila de `Account`. |
| `secrets.in-logs.test.ts`             | Un request que incluye una `password`, un token CSRF, una cookie `Authorization`, o un query param `code` de Google no causa que ninguno de esos valores aparezca en el log capturado (BR-AUTH-11). |
| `origin-check.test.ts`                | `POST /api/auth/register` con un header `Origin` faltante o que no matchea devuelve 403 `FORBIDDEN`. |
| `argon2.parameters.test.ts`           | `hashArgon2id` con los parámetros elegidos produce un hash en el rango 50–100 ms en la VM target. Falla el test si el runtime cae afuera de la banda. |
| `cookie.attributes.test.ts`           | La cookie `authjs.session-token` tiene `HttpOnly` y `SameSite=Lax` siempre; `Secure` en producción, omitido en dev. |

### Gate de cobertura

`pnpm test -- --coverage` corre en CI. La cobertura line
+ branch del módulo auth debe ser ≥ 80 % para hacer merge
(per la regla de "mínimo 80 % en domain + application" de
la skill `testing-standards`). La cobertura efectiva se
registra en el `verify-report` al final del cambio.

### Configuración de Vitest

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node', // no jsdom — testeamos el server, no la UI
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json'],
      include: [
        'src/modules/auth/**',
        'src/shared/db/**',
        'src/shared/env/**',
        'src/modules/api/**',
      ],
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
    },
    testTimeout: 10000, // verify de Argon2id + roundtrip a DB puede ser lento
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

El archivo `test/setup.ts` inicializa el container de
Postgres de test (testcontainers) y exporta un teardown
que dropea la base. El `DATABASE_URL` se rescribe para
apuntar al container antes de que corra
`envSchema.parse()`.

## 9. Workflow de CI

GitHub Actions, en `pull_request` a `develop` y en `push`
a `develop` y `main`. El workflow es dueño de este cambio;
el cambio `fly-deploy` puede agregar un job `deploy`
después (NO vive en este PR).

```yaml
# .github/workflows/ci.yml
name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
          POSTGRES_DB: gastos_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql://test:test@localhost:5432/gastos_test
      AUTH_SECRET: ci-only-secret-32-bytes-min-padding
      AUTH_URL: http://localhost:3000
      APP_URL: http://localhost:3000
      AUTH_GOOGLE_ID: ci-google-id
      AUTH_GOOGLE_SECRET: ci-google-secret
      ARGON2ID_DUMMY_PASSWORD: ci-dummy-password-32-bytes-min-padding
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test -- --coverage
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage
          path: coverage/
      - name: Comment coverage on PR
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: coverage
          message: |
            Coverage report:
            - Lines: ${{ steps.coverage.outputs.lines }}
            - Branches: ${{ steps.coverage.outputs.branches }}
            - Functions: ${{ steps.coverage.outputs.functions }}
            Ver el artifact `coverage/` para el reporte lcov completo.
```

**Dependencias de jobs:** los tres jobs (`lint`,
`typecheck`, `test`) corren en paralelo. El cambio
`fly-deploy` agrega un job `build` y `deploy` que depende
de los tres.

**Estrategia de cache:** `actions/setup-node` con
`cache: 'pnpm'` cachea `~/.local/share/pnpm/store` keyed
on `pnpm-lock.yaml`. `corepack enable` aprovisiona `pnpm`
desde el campo `packageManager` de `package.json`. CI usa
`pnpm install --frozen-lockfile` (sin upgrades
implícitos).

**Required checks en PRs a `develop`:** `lint`,
`typecheck`, `test` deben pasar todos. La regla de branch
protection de `develop` enforce esto (configurado en el
commit inicial de chore, no en este cambio).

**Concurrency:** el grupo `concurrency` cancela runs in
progress para el mismo ref, así que un force-push a un PR
cancela el viejo test run.

## 10. Open questions for the parent

Estos son los 8 decision gaps de la propuesta, codificados
como decisiones a nivel design con defaults conservadores.
**Ninguno bloquea apply.** Cada uno tiene un default y un
camino de resolución; la fase de apply puede enviar con
los defaults y la fase de sdd-verify puede re-abrir
cualquiera de ellos.

1. **¿Se actualiza `User.email` cuando Google devuelve un
   email nuevo?**
   - **Default**: No. Conservamos el email original con el
     que el usuario se registró. El `sub` de la cuenta de
     Google (`providerAccountId`) es la única clave de
     vínculo; si el usuario cambia su email en Google, el
     `User.email` NO cambia. Mostramos el cambio en la UI
     como notificación ("tu email de Google cambió; el
     email de tu cuenta sigue siendo el original").
   - **Camino de resolución**: si producto quiere
     auto-sync, agregamos un callback en el flujo `signIn`
     que actualice `User.email` desde el perfil de Google
     en cada callback OAuth. Trackeado en un cambio futuro.

2. **¿Las updates de `lastLoginAt` van por el callback
   `signIn` de Auth.js o por un middleware de Prisma?**
   - **Default**: callback `signIn` de Auth.js. La llamada
     `prisma.user.update({ data: { lastLoginAt: new Date()
     } })` vive en el callback mostrado en §3.
   - **Camino de resolución**: el middleware de Prisma
     funcionaría pero es más difícil de testear (corre en
     cada query). El callback es el extension point
     documentado de Auth.js.

3. **¿Exponemos la `/api/auth/session` built-in de
   Auth.js o la envolvemos con un endpoint de Hono?**
   - **Default**: exponemos la ruta built-in de Auth.js
     directamente. La forma (`{ user, expires }`) es
     estable y el hook `useSession()` de la UI la consume
     de forma nativa. `GET /api/me` en Hono es para
     server components y fetches server-side; lee `auth()`
     directamente, no `/api/auth/session`.
   - **Camino de resolución**: si se necesita un campo
     custom en el JSON de sesión, lo agregamos en el
     callback `session` (§3) y re-miramos la forma en la
     wire.

4. **Sliding window de sesión: 24h (default de Auth.js) o
   más corto?**
   - **Default**: 24h, que es el default de Auth.js
     `session.updateAge = 24 * 60 * 60`. El
     `session.maxAge` de 30 días es el cap; la extensión
     sliding ocurre en cada request que encuentra una
     sesión válida.
   - **Camino de resolución**: cambiar
     `session.updateAge` en `authConfig` y re-testear el
     security review con el nuevo valor.

5. **¿Qué pasa con las otras sesiones en un password
   change?**
   - **Default**: nada en MVP. Las otras sesiones
     sobreviven hasta que expiren por su cuenta. No hay
     endpoint de password change en este cambio, así que
     esta pregunta es irrelevante por ahora.
   - **Camino de resolución**: un futuro cambio
     `password-management` agrega el endpoint y usa
     `prisma.session.deleteMany({ where: { userId } })`
     para revocar todas las otras sesiones en el password
     change.

6. **¿Enviamos un email de notificación en el auto-link?**
   - **Default**: No. Fuera de alcance. Un futuro pase de
     hardening es dueño de la infraestructura de email
     transaccional.
   - **Camino de resolución**: trackear en el cambio
     `email-notifications` que sigue al `user-deletion`.

7. **¿Necesitamos una UI de "switch account" para
   usuarios con múltiples providers OAuth?**
   - **Default**: No. La UI muestra un provider a la vez
     (el campo `defaultProvider` en la respuesta de
     `me`). "Switch account" es una feature de UX; si
     producto lo quiere, el cambio `ui-auth-shell` es
     dueño de la UI.
   - **Camino de resolución**: trackear para el follow-up
     de `ui-auth-shell`.

8. **Librería Argon2id: `argon2` (nativa) vs.
   `@node-rs/argon2`?**
   - **Default**: `@node-rs/argon2`. Binarios NAPI
     prebuilt para Alpine, sin paso de `node-gyp`, rápido
     en Node 20.
   - **Camino de resolución**: la fase de apply corre el
     gate de benchmark descrito en §2 (Argon2id library).
     Si `@node-rs/argon2` falla al cargar o hashea afuera
     del target 50–100 ms, caemos a `argon2` (un cambio
     de import de una línea en
     `src/modules/auth/infrastructure/external/argon2.hasher.ts`).
     El resultado del benchmark se registra en el archivo
     `apply-progress.md`.

## 11. Riesgos específicos de apply

Cada riesgo tiene una mitigación que vive dentro de una
task existente (agregada en `sdd-tasks`), no una task
nueva.

| Riesgo | Mitigación |
|--------|------------|
| **`@node-rs/argon2` falla al instalar o cargar en la VM target.** | La task de apply del password service tiene un paso "verify load + benchmark" que corre el install + un smoke test. Si el prebuilt falta, la task cae a `argon2` (el paquete npm) y re-corre el benchmark. Ambos exponen la misma superficie de primitivas. |
| **Hash time de Argon2id afuera del target 50–100 ms en la VM 1-CPU de Fly.io.** | El gate de benchmark en la task del password service. Si el p50 del hash time cae afuera de la banda, re-afinamos `timeCost` (1, 2, 3) antes de enviar. La decisión se registra en `apply-progress.md`. |
| **La superficie de API de Auth.js v5 beta cambia entre la versión pineada y un beta posterior.** | Pineamos la versión exacta `next-auth@5.0.0-beta.X` en `package.json` y usamos `pnpm install --frozen-lockfile` en CI. Upgradear requiere una decisión explícita en un cambio posterior. |
| **Drift de migración de Prisma en el free tier de Neon durante la fase de apply.** | La task de apply de la migración corre `prisma migrate dev` localmente primero, commitea el `migration.sql` generado, y corre `prisma migrate deploy` en el job de test de CI. El deploy es idempotente. |
| **Credenciales de Google OAuth mal configuradas en el primer intento de sign-in.** | La task de apply del provider Google tiene un paso "smoke test con el cliente OAuth de test". El client ID y secret de test están en `.env.test`; un sign-in manual se hace en dev para verificar el round trip antes de marcar la task como done. |
| **El catch-all de Hono matchea por accidente `/api/auth/*` y maneja doble los requests.** | La task de apply del catch-all incluye un test de routing que prueba que `/api/auth/signin` va a Auth.js y `/api/me` va a Hono. El test assertea que ambas rutas devuelven sus shapes esperados desde el mismo server de Next.js. |
| **El middleware de origin-check bloquea POSTs cross-origin legítimos en dev.** | El default de `APP_URL` es `http://localhost:3000`. La task de apply del middleware de origin-check testea los casos same-origin (permitido) y cross-origin (bloqueado). La UI monta el form en el mismo origin, así que los requests legítimos nunca se bloquean. |
| **Evento `UserRegistered` despachado en el camino de auto-link.** | El evento se despacha en la acción `POST /api/auth/register` (para local) y en la rama "primera vez que vemos este email" del callback OAuth (para Google). El camino de auto-link (BR-AUTH-5) NO despacha `UserRegistered`. La task de apply de los events incluye un test parametrizado que assertea que el evento se dispara exactamente una vez por user. |
| **Costo de inicialización de DUMMY_HASH de Argon2id en el primer request.** | `DUMMY_HASH` se genera al init del módulo (`const DUMMY_HASH = hashArgon2id(env.ARGON2ID_DUMMY_PASSWORD)` a top-level). El primer request al callback de Credentials es ~50–100 ms más lento; los subsiguientes son rápidos. Aceptamos esto en MVP. Un follow-up puede mover la inicialización a un hook de startup si se vuelve un problema. |
| **Índice `expires` agregado en `Session` pero no hay job de GC en este cambio.** | Documentado. El job de GC es un cambio aparte; hasta entonces, las sesiones expiradas se acumulan. El lookup de `auth()` es por `sessionToken`, así que la falta de GC no afecta correctness, solo tamaño de DB. |
| **`session.user.id` tipado de Prisma es `string` en los tipos de Auth.js v5 pero `unknown` en algunas versiones beta.** | El callback `session` de §3 narrowea el type y assgigna `session.user.id = user.id`. Si el type cambia, el guard `if (user?.id)` del callback captura el issue. |
| **`pnpm install --frozen-lockfile` falla en CI cuando `pnpm-lock.yaml` falta o está out of sync.** | El job `lint` de §9 corre `pnpm install --frozen-lockfile` y falla rápido. El `package.json` tiene `"packageManager": "pnpm@<version>"` así que `corepack` aprovisiona la versión correcta. |
