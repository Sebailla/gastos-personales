# Design — `auth-foundation-slice-c`

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-13 · **Change**: `auth-foundation-slice-c`
**Change padre**: `auth-foundation` (Slice A + B mergeadas) · **Deltas de spec**: `openspec/changes/auth-foundation-slice-c/spec.md`
**Capacidades afectadas**: auth (extiende el spec canónico `openspec/specs/auth/spec.md`)

## Objetivo

Implementar las 9 tasks restantes del SDD change `auth-foundation` (T-025..T-033), cerrar el FLAG-1 CRÍTICO del verify del change padre (module-resolution bug, issue #18) y cerrar el FLAG-2 (drift bilingüe en `apply-progress.md`). El trabajo se divide en 3 sub-slices chained: C-1 (module-resolution + Hono catch-all + middleware + public API), C-2 (security tests + CI workflow + branch protection), C-3 (5 ADRs + `docs/architecture.md` + `README.md` + handoff).

Este documento **NO** re-debate el spec. Implementa el "qué" del spec con el "cómo".

---

## 1. Diseño del fix de module-resolution (DELTA-C1.1)

### 1.1 Decisión

Patchear el resolver de Vite en `vitest.config.ts` con un `resolve.alias` que mapea el import bare `'next/server'` a un stub de 30 líneas en `test/stubs/next-server.ts`. El stub provee `NextRequest` y `NextResponse` mínimos (no-op) — suficiente para los 3 test files que importan `next-auth` (que transitivamente importa `next/server` sin la extensión `.js`). El stub es sólo para tests; el runtime de producción usa el `next/server` real.

### 1.2 Cambio en `vitest.config.ts`

Agregar una entrada en `resolve.alias` dentro del bloque `defineConfig` existente:

```typescript
// vitest.config.ts (delta desde Slice B)
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // ... config existente
  resolve: {
    alias: {
      ...(aliases existentes de Slice B),
      // Module-resolution fix (DELTA-C1.1): next-auth@5.0.0-beta.31 importa
      // 'next/server' (sin extensión) en su build ESM. El resolver estricto
      // de Vite rechaza los bare imports. Mapeamos a un stub de 30 líneas.
      'next/server': path.resolve(__dirname, 'test/stubs/next-server.ts'),
    },
  },
});
```

### 1.3 `test/stubs/next-server.ts` (archivo nuevo, ~30 líneas)

```typescript
// test/stubs/next-server.ts
// Stub mínimo para next/server en el entorno de Vitest.
// Requerido por DELTA-C1.1: next-auth@5.0.0-beta.31 importa 'next/server'
// (sin extensión) desde su build ESM. El resolver estricto de Vite
// rechaza los bare imports. El runtime real de Next.js no está disponible
// en Vitest; este stub provee una superficie no-op que satisface el import
// y el código de test que construye instancias de NextRequest/NextResponse.
//
// Esto es sólo para tests. El runtime de producción usa el next/server real.

export class NextRequest {
  constructor(input: Request | string, init?: RequestInit) {
    // no-op
  }
}

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit): NextResponse {
    return new NextResponse(JSON.stringify(data), {
      ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
    });
  }

  static redirect(url: string, init?: ResponseInit): NextResponse {
    return new NextResponse(null, {
      ...init,
      status: 302,
      headers: { location: url, ...(init?.headers || {}) },
    });
  }
}

export const userAgent = 'vitest';
```

### 1.4 Fallback

Si el stub es insuficiente (por ejemplo, `next-auth` llama a funciones reales del runtime de `next/server` en tiempo de test, no sólo en el import), el fallback es bumpear `next-auth` a `>=5.0.0-beta.32` cuando esté disponible. El apply worker de C-1 reporta si el stub es insuficiente; el parent decide si tomar el fallback.

### 1.5 Verificación de re-include (lo que el apply worker de C-1 DEBE verificar)

1. Agregar la entrada de `resolve.alias` en `vitest.config.ts`.
2. Crear `test/stubs/next-server.ts` con el contenido de arriba.
3. **Quitar las 3 entradas** del `test.exclude` en `vitest.config.ts`:
   - `'src/modules/auth/index.test.ts'`
   - `'src/modules/auth/infrastructure/external/authjs.test.ts'`
   - `'**/app/api/auth/**/route.test.ts'`
4. Correr `npx vitest run` (usá `npx` para evitar el `ignoredBuiltDependencies` pre-check de pnpm). Esperar **137/137 tests verde**.
5. Correr `npx vitest run --coverage`. Esperar coverage en `src/modules/auth/**` ≥ 80%.
6. Si alguno de los 3 files falla: re-agrear las entradas, documentar la falla en el handoff de C-1, el parent decide.

---

## 2. Arquitectura del Hono catch-all (DELTA-C2.1, T-025)

### 2.1 Archivo: `app/api/[...path]/route.ts` (~30 líneas)

```typescript
// app/api/[...path]/route.ts
// Hono catch-all: delega las requests no-auth a honoApp.fetch. Auth.js
// (app/api/auth/[...nextauth]/route.ts) toma precedencia por el file-based
// routing de Next.js (la ruta más específica gana).

import { honoApp } from '@/modules/api';
import type { NextRequest } from 'next/server';

async function handler(request: NextRequest): Promise<Response> {
  return honoApp.fetch(request);
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const DELETE = handler;
```

### 2.2 Precedencia de routing

El file-based routing de Next.js matchea `app/api/auth/[...nextauth]/route.ts` **antes** que `app/api/[...path]/route.ts` (la ruta más específica gana). El `app.fetch` de Hono **nunca** ve requests a `/api/auth/*` porque Auth.js las intercepta. Esto se verifica con los 2 integration tests.

### 2.3 Tests (2 cases, integration contra un Next.js server real)

1. `GET /api/me` sin session cookie → 401 con `{ error: { code: 'UNAUTHORIZED', ... } }`
2. `GET /api/auth/signin` → devuelve la respuesta HTML de Auth.js, NO el JSON de Hono

### 2.4 Decisión de infraestructura de test

La desviación #2 de Slice A notó que los testcontainers no están en la infraestructura de CI del proyecto. Los 2 integration tests usan **Option B** (test de Vitest que spawna un proceso `next dev` y usa `fetch` contra él). El camino de testcontainers (Option A) queda documentado como follow-up.

---

## 3. Superficie pública del API (DELTA-C2.2 + DELTA-C2.3, T-026)

### 3.1 Archivo: `src/modules/auth/index.ts` (~30 líneas)

```typescript
// src/modules/auth/index.ts
// Superficie pública del módulo auth. Otros módulos (accounts-ledger,
// transactions) pueden importar SÓLO desde este archivo.

export { auth, signIn, signOut, handlers } from './infrastructure/external/authjs';
export { honoApp } from '@/modules/api';
export const UserRegistered = 'UserRegistered' as const;
export const UserSignedIn = 'UserSignedIn' as const;
```

### 3.2 Enforcement en compile-time

`tsconfig.json` tiene `verbatimModuleSyntax: true` e `isolatedModules: true`. Cualquier import desde un path no exportado falla en compile time. El test `src/modules/auth/index.test.ts` verifica que los named exports existen y que `src/modules/auth/index.ts` es el único entry point.

### 3.3 Archivo: `middleware.ts` en la raíz del proyecto (~20 líneas)

```typescript
// middleware.ts
// Next.js middleware: 302 redirect más rápido para páginas App Router
// no autenticadas. La ruta /api/me de Hono ya devuelve 401 cuando falta
// la sesión; el middleware es el path más rápido para App Router
// (ej. /dashboard).

import { auth } from '@/modules/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PUBLIC_PATHS = ['/auth/signin', '/auth/signout', '/'];

export default auth((request) => {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isAuthed = !!request.auth;

  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/signin';
    return NextResponse.redirect(url);
  }
});

export const config = {
  matcher: ['/((?!_next|api/auth|favicon.ico).*)'],
};
```

### 3.4 Tests (2 cases)

1. Request no autenticada a `/dashboard` → 302 redirect a `/auth/signin`
2. Request autenticada a `/dashboard` → 200

---

## 4. Arquitectura de los security tests (DELTA-C2.4..C2.9, T-027)

### 4.1 Ubicación

Los 6 security tests viven en `src/modules/auth/__tests__/security/`:

```
src/modules/auth/__tests__/security/
├── login.timing.test.ts
├── oauth.state-csrf.test.ts
├── secrets.in-logs.test.ts
├── origin-check.test.ts
├── argon2.parameters.test.ts
└── cookie.attributes.test.ts
```

### 4.2 Los 6 tests

| #   | Archivo                     | Requirement                                                      | Método de test                                        |
| --- | --------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `login.timing.test.ts`      | Welch's t-test, p > 0.01 sobre 30 paired samples                 | Test estadístico con Argon2id real                    |
| 2   | `oauth.state-csrf.test.ts`  | `state` tampering rechazado, no `User`/`Account` rows insertadas | Mock Auth.js callback, assert row counts              |
| 3   | `secrets.in-logs.test.ts`   | 4 tipos de secrets no aparecen en el log output                  | Capturar log output durante register/callback/session |
| 4   | `origin-check.test.ts`      | Cross-origin POST → 403 `FORBIDDEN`                              | Assert 403 status                                     |
| 5   | `argon2.parameters.test.ts` | Hash median en [50, 100] ms en CI runner                         | 30 hashes, tomar median                               |
| 6   | `cookie.attributes.test.ts` | `HttpOnly` + `SameSite=Lax` siempre; `Secure` en producción      | Capturar `Set-Cookie` header                          |

### 4.3 Decisión testcontainers-vs-fakes

- Tests #1 (timing), #5 (argon2id), #6 (cookies) necesitan **Argon2id real** runtime. Fakes invalidan la medición de timing.
- Tests #2 (OAuth state), #3 (secrets), #4 (origin-check) pueden usar el patrón fake-Prisma existente (per Slice A desviación #2).
- **Recomendación**: para #1, #5, #6 usar Argon2id real (`@node-rs/argon2` ya es dep, corre in-process). Para #2-#4 usar fake-Prisma. Esto evita la dependencia de testcontainers.

### 4.4 Flag local `--skip-timing`

Localmente, el test #1 (timing) es ruidoso en Mac. El apply worker de C-2 implementa el skip como una env var (`SKIP_TIMING=true`) leída al tope de `login.timing.test.ts`. CI corre la suite completa; local se puede opt-out.

---

## 5. Diseño del CI workflow (DELTA-C3.1, T-028)

### 5.1 Archivo: `.github/workflows/ci.yml` (~90 líneas, YAML)

```yaml
# .github/workflows/ci.yml
name: ci

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
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run typecheck

  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: gastos
          POSTGRES_PASSWORD: gastos
          POSTGRES_DB: gastos_test
        ports: [5432:5432]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgres://gastos:gastos@localhost:5432/gastos_test
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm prisma migrate deploy
      - run: pnpm test --coverage
      - uses: actions/upload-artifact@v4
        with: { name: coverage, path: coverage/ }

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.6.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test src/modules/auth/__tests__/security/
```

### 5.2 Dependencia de testcontainers

El job `test` necesita un Postgres service. La recomendación es **Option A** (GitHub-hosted `services: postgres:`, como se muestra arriba). El alternative de Neon (Option B) queda como follow-up si Option A flaquea.

### 5.3 Sin force-push a main

Per `ci-cd-pipeline` skill + AGENTS.md §5.2: el workflow no pushea, sólo el user. El CI status gatea merges, no pushes.

---

## 6. Borradores de ADRs (DELTA-C3.3, T-030)

### 6.1 Ubicación

5 ADRs en `docs/adr/`, MADR template (Markdown Any Decision Record):

- `docs/adr/0001-authjs-v5.md`
- `docs/adr/0002-prisma-6.md`
- `docs/adr/0003-argon2id-parameters.md`
- `docs/adr/0004-hono-catch-all.md`
- `docs/adr/0005-auto-link-security-model.md`

### 6.2 Estructura por ADR (MADR)

```markdown
# ADR-NNNN — <título>

**Status**: Accepted · **Date**: 2026-06-13 · **Deciders**: Sebastián Illa

## Context and Problem Statement

<Por qué esta decisión es necesaria.>

## Decision Drivers

- <Lista de fuerzas que influyen en la decisión>

## Considered Options

1. <Opción 1>
2. <Opción 2>
3. <Opción 3>
4. <Opción 4>

## Decision Outcome

**Chosen option**: "<opción N>", because <rationale>.

### Consequences

- **Good**: <lista>
- **Bad**: <lista>

### Confirmation

<Cómo se valida la decisión.>
```

### 6.3 Resumen de cada ADR

- **0001-authjs-v5.md**: Auth.js v5 (`next-auth@5.0.0-beta.31`). Alternatives: Lucia (deprecada 2025-04), Clerk (vendor lock-in + costos), Supabase Auth (lock-in), hand-rolled (demasiada superficie).
- **0002-prisma-6.md**: Prisma 6. Alternatives: Kysely (más boilerplate), raw SQL (sin type safety), Drizzle (menos maduro).
- **0003-argon2id-parameters.md**: `memoryCost=19456, timeCost=2, parallelism=1` (median 65 ms en CI). Alternatives: bcrypt (menos seguro), scrypt (más lento), Argon2i/d (algoritmo diferente).
- **0004-hono-catch-all.md**: Hono en `app/api/[...path]/route.ts`. Alternatives: pure Next.js route handlers (sin typed client), tRPC (curva de aprendizaje más empinada), Fastify (requiere servidor Node separado).
- **0005-auto-link-security-model.md**: auto-link on email match (estándar de industria; Notion, Linear, Vercel lo hacen). Alternatives: no auto-link (mala UX), auto-link sólo en `email_verified: true` (peor UX).

---

## 7. Estructura de docs (DELTA-C3.4 + DELTA-C3.5 + DELTA-C3.6, T-031 + T-032 + parte de T-033)

### 7.1 Sección "Auth" en `docs/architecture.md` (~150 líneas)

Agregar una sección "Auth" al `docs/architecture.md` existente con:

- **Diagrama Mermaid de alto nivel** (el mismo del design §1 del change padre)
- **Resumen del data model**: 4 modelos Prisma, 3 columnas añadidas, constraint `@@unique([provider, providerAccountId])`
- **Rutas**: 8 rutas de Auth.js + 3 rutas de Hono
- **Estrategia de sesión**: database sessions (sin JWT), 30-day maxAge, 24-hour sliding window
- **Auto-link security model**: estándar de industria on email match
- **Cross-module contracts**: `auth()` como único path de resolución de identidad, `User` como anchor, eventos `UserRegistered` / `UserSignedIn`

### 7.2 Sección "Local dev" en `README.md` (~30 líneas)

Agregar al `README.md` con:

- `pnpm install` para dependencias
- Setup de Postgres: `docker compose up -d postgres` (o usar Neon free-tier)
- `pnpm dev` para el dev server
- `pnpm test` para la suite de tests
- `pnpm test -- src/modules/auth/__tests__/security/` para los security tests
- `SKIP_TIMING=true pnpm test` para desarrollo local ruidoso

### 7.3 Mirror `Documents-es/docs/architecture.md`

Traducción fiel de la sección Auth, voseo rioplatense. Actualizado en el mismo commit que la fuente en inglés.

### 7.4 Mirror `Documents-es/README.md`

Traducción fiel de la sección local-dev, voseo rioplatense. Mismo commit.

### 7.5 Re-sync de `Documents-es/openspec/changes/auth-foundation/apply-progress.md` (cierre de FLAG-2)

El `apply-progress.md` del change padre está stale en español. El apply worker de C-3 actualiza el mirror español para incluir la sección de Slice B. Commit único al final de C-3, atómico con el handoff.

---

## 8. Mapa de Strict TDD

Per `openspec/config.yaml` del change padre (`strictTdd.enabled: true`):

Tabla con 14 filas: T-025, T-026, T-027.1..6, T-028, T-029, T-030, T-031, T-032, T-033. Cada fila con: Task, Test files, RED, GREEN, TRIANGULATE, REFACTOR. (El detalle es el mismo que el de la sección 8 del design en inglés.)

---

## 9. Forecast de review workload

| Sub-slice                                                     | Tasks                           | Líneas estimadas | Overage vs 400       |
| ------------------------------------------------------------- | ------------------------------- | ---------------- | -------------------- |
| C-1 (module-resolution + catch-all + middleware + public API) | DELTA-C1.1, T-025, T-026        | ~200             | 0.5× (¡bajo budget!) |
| C-2 (security tests + CI + branch protection)                 | T-027, T-028, T-029             | ~700             | 1.75×                |
| C-3 (ADRs + architecture.md + README + handoff)               | T-030, T-031, T-032, T-033      | ~600             | 1.5×                 |
| **Total**                                                     | 9 tasks + module-resolution fix | ~1,500           | —                    |

C-1 está bajo el budget de 400. C-2 y C-3 lo exceden pero el user ya aceptó el overage para el change padre. Los 3 PRs chained van en orden C-1 → C-2 → C-3.

---

## 10. Riesgos y dependencias

- **Insuficiencia del stub de module-resolution**: si `next-auth` llama a funciones reales del runtime de `next/server` en tiempo de test, el stub falla. Fallback: bumpear `next-auth@5.0.0-beta.32+` o patchear Vite diferente.
- **Testcontainers para security tests**: tests #1, #5, #6 necesitan Argon2id real (no testcontainers, pero la misma categoría de "dependencia externa real"). In-process vía `@node-rs/argon2` es suficiente.
- **CI Postgres service** (Option A): el `services: postgres:` de GitHub puede flaquear en ciertas imágenes. Fallback: Neon free-tier.
- **Confiabilidad del test de timing**: ruidoso en Mac. La env var `SKIP_TIMING=true` lo maneja; CI corre la suite completa.
- **Drift bilingüe** (cierre de FLAG-2): el worker de C-3 debe actualizar el `apply-progress.md` español atómicamente con el handoff de C-3. Si lo olvida, el verify lo re-flagea.
- **Los 61 vulns de pnpm audit** (issue #7) siguen abiertos. Los PRs semanales los manejan en su propio ciclo. Este change no los aborda.

---

## 11. Fuera de scope (este design)

- Los 61 vulns de pnpm audit (issue #7).
- Email verification flow (futuro change).
- Password reset flow (futuro change).
- 2FA (futuro change).
- Nuevos auth providers más allá de Google y Credentials.
- Los SDD changes `accounts-ledger`, `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy`.

---

## 12. Próximo paso

La próxima fase SDD es `sdd-tasks` (T-025..T-033 + module-resolution fix divididos en 14 commits atómicos con TDD evidence columns). Después: `sdd-apply` (3 sub-slice PRs chained: C-1, C-2, C-3).
