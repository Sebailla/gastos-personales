# Propuesta — `auth-foundation-slice-c`

**Estado**: borrador · **Autor**: Sebastián Illa
**Creado**: 2026-06-13 · **Slice objetivo**: Slice C de `auth-foundation` · **Capacidad**: auth
**Upstream**: preflight SDD global (interactive, both, auto-forecast, 400 líneas)
**Change padre**: `auth-foundation` (Slice A + B ya mergeadas a develop como PRs #5, #17) · **Reporte de verificación**: `file-only/verify-auth-foundation-slice-ab.md` · **Flag CRÍTICO**: issue #18 (module-resolution bug)

## Por qué

El change padre `auth-foundation` está incompleto de implementación. Slice A (T-001..T-018) y Slice B (T-019..T-024) mergearon a develop vía los PRs #5 y #17. Slice C (T-025..T-033) — 9 tasks — está pendiente.

El reporte de verificación del change padre (`file-only/verify-auth-foundation-slice-ab.md`, estado `PASS_WITH_FLAGS`) flagueó:

- **FLAG-1 (CRÍTICO)**: module-resolution bug, trackeado como issue #18. `next-auth@5.0.0-beta.25` importa `'next/server'` (sin la extensión `.js`) en su build ESM; el resolver estricto de ESM de Vite rechaza el bare import. El bump a `next-auth@5.0.0-beta.31` en el PR #16 **no** cerró el bug. Tres archivos de test siguen excluidos en `vitest.config.ts`:

  - `src/modules/auth/index.test.ts`
  - `src/modules/auth/infrastructure/external/authjs.test.ts`
  - `app/api/auth/[...nextauth]/route.test.ts`

  La cobertura en `src/modules/auth/**` queda por debajo del 80% target por esas exclusiones. Slice C es el hogar natural para la resolución.

- **FLAG-2 (WARNING)**: drift bilingüe en `apply-progress.md`. El `openspec/changes/auth-foundation/apply-progress.md` en inglés cubre Slice A + Slice B; el mirror español en `Documents-es/openspec/changes/auth-foundation/apply-progress.md` está stale en Slice A solamente.

Este change implementa Slice C (T-025..T-033) y cierra los dos flags.

## Qué

Tres sub-slices chained, todos dentro de este único SDD change. Cada sub-slice es un PR.

### Sub-slice C-1 — Fix del module-resolution + Hono catch-all + middleware + public API (3 tasks, ~80 LOC)

- **Fix del module-resolution (cierre de FLAG-1)**: patch de `vitest.config.ts` con un `resolve.alias` que mapea `'next/server'` a un stub chiquito en `test/stubs/next-server.ts`. El stub reexporta la superficie que toca `next-auth` (`NextRequest`, `NextResponse`) para que el import resuelva. Re-incluí los 3 archivos de test excluidos. Target: **137/137 tests verde** (eran 134/134 con 3 excluidos).
- **T-025**: Hono catch-all en `app/api/[...path]/route.ts`. Delega `GET`/`POST`/`PATCH`/`DELETE` a `honoApp.fetch(request)`. El catch-all de Hono **no** matchea `/api/auth/*` (el file-based routing de Next.js resuelve primero `app/api/auth/[...nextauth]/route.ts`). Dos tests de integración confirman que `/api/auth/signin` routea a Auth.js y `/api/me` routea a Hono.
- **T-026**: Export de la public API desde `src/modules/auth/index.ts` + middleware de Next.js en `middleware.ts` para protección de `/api/me`. El middleware redirige requests no autenticados a `/auth/signin` (faster-fail que el 401 de Hono). Dos tests: los exports con nombre existen; middleware 302 vs 200.

### Sub-slice C-2 — Security tests + CI workflow + branch protection (3 tasks, ~700 LOC)

- **T-027**: 6 security tests en `src/modules/auth/__tests__/security/`:
  1. `login.timing.test.ts` — Welch's t-test, p > 0.01 sobre 30 muestras, con un flag `--skip-timing` para dev local ruidoso.
  2. `oauth.state-csrf.test.ts` — `state` faltante o manipulado rechaza, no se insertan filas `User`/`Account`.
  3. `secrets.in-logs.test.ts` — `password`, `refresh_token`, `Authorization: Bearer …`, `id_token`, token CSRF nunca aparecen en la salida de log capturada a través de los paths de register, OAuth callback y session-resolution (BR-AUTH-11).
  4. `origin-check.test.ts` — `POST /api/auth/register` con `Origin` faltante o que no matchea devuelve 403 `FORBIDDEN`; POST same-origin permitido.
  5. `argon2.parameters.test.ts` — `hashArgon2id` con los parámetros elegidos corre en 50–100 ms en el runner de CI; falla fuera de la banda. Re-corre `scripts/bench-argon2.ts` en CI.
  6. `cookie.attributes.test.ts` — la cookie `authjs.session-token` siempre tiene `HttpOnly` y `SameSite=Lax`; `Secure` en producción.
- **T-028**: `.github/workflows/ci.yml` con 4 jobs paralelos: `lint` (lint + typecheck), `test` (vitest --coverage, sube artifact, postea comentario en el PR), `build` (Next.js production build), `security` (el más lento; corre aparte para que los flakes de timing no bloqueen los otros jobs). La concurrencia cancela runs en vuelo sobre el mismo ref. Corre en `pull_request` a `develop`/`main` y `push` a `develop`/`main`.
- **T-029**: `.github/CODEOWNERS` + `docs/branch-protection.md`. Las reglas de branch protection (1 review, CI verde en los 4 jobs, descartar approvals stale en push, historia lineal, sin force-pushes) están documentadas; la configuración real del lado de GitHub la aplica el user (requiere permisos de repo-admin).

### Sub-slice C-3 — Docs + handoff (4 tasks, ~400 LOC)

- **T-030**: 5 ADRs en `docs/adr/`, template MADR (Context, Decision, Consequences, Alternatives considered):
  - `0001-authjs-v5.md` — por qué Auth.js v5 sobre Lucia, Clerk, Supabase Auth, hand-rolled.
  - `0002-prisma-6.md` — por qué Prisma 6 sobre Kysely, SQL raw.
  - `0003-argon2id-parameters.md` — `memoryCost=19456, timeCost=2, parallelism=1`, el benchmark, el fallback.
  - `0004-hono-catch-all.md` — por qué Hono sobre route handlers puros de Next.js, tRPC, Fastify; la forma `OpenAPIHono` + `hc<typeof honoApp>`.
  - `0005-auto-link-security-model.md` — auto-link estándar de la industria sobre match de email; BR-AUTH-5 / BR-AUTH-10; el deferral del hardening pass.
- **T-031**: `docs/architecture.md` gana una sección "Auth" (diagrama Mermaid, resumen del data model, rutas, estrategia de sesión, modelo de seguridad de auto-link, contratos cross-module). El mirror español `Documents-es/docs/architecture.md` se actualiza en el mismo commit.
- **T-032**: `README.md` gana una sección de dev local. El mirror español se actualiza en el mismo commit.
- **T-033**: Commit final del handoff, push, abrir PR, pedir reviewer.

### Endpoints (Hono catch-all, después de Sub-slice C-1)

| Endpoint                                                                | Comportamiento                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `GET /api/health`                                                       | 200 `{ data: { status: 'ok', version, uptime } }`                                           |
| `GET /api/me`                                                           | 200 `{ data: PublicUser }` cuando hay sesión; 401 `UNAUTHORIZED` si no                      |
| `POST /api/auth/register`                                               | 201 en éxito; 400 `VALIDATION_ERROR` / `WEAK_PASSWORD`; 409 `EMAIL_TAKEN`; con origin-check |
| `GET /api/auth/*` (signin, signout, callback, session, providers, csrf) | Todas las rutas de Auth.js v5, montadas en `app/api/auth/[...nextauth]/route.ts`            |
| `GET\|POST /app/*` (páginas de server-component)                        | El middleware redirige requests no autenticados a `/auth/signin`                            |

### Modelo de datos

No hay modelos ni columnas nuevas en Prisma. Sub-slice C-1 sólo **integra** lo que Slice A construyó (4 modelos, 3 columnas agregadas, la constraint `@@unique([provider, providerAccountId])`). No hace falta `prisma migrate dev`; `pnpm prisma generate` corre una vez para refrescar el client.

### Comportamiento

#### Fix del module-resolution (cierre de FLAG-1, Sub-slice C-1)

La causa raíz es el build ESM de `next-auth@5.x` importando `'next/server'` (bare, sin extensión) desde `node_modules/next-auth/lib/env.js`. El resolver estricto de Vite rechaza la ruta bare; el archivo real es `next/server.js`. El patch vive en `vitest.config.ts#resolve.alias`:

```ts
resolve: {
  alias: {
    '^next/server$': path.resolve(__dirname, 'test/stubs/next-server.ts'),
    '@': path.resolve(__dirname, './src'),
  },
}
```

`test/stubs/next-server.ts` es un stub de 30 líneas que reexporta la superficie que toca `next-auth` (`NextRequest`, `NextResponse`). Es un stub **de test únicamente**; el código de producción nunca lo importa (el bundler de Next.js resuelve `'next/server'` correctamente en build time). Esto destraba el bug upstream de `next-auth` sin cambiar el runtime de producción.

Si el stub no cubre la superficie del import (la superficie es más amplia de lo esperado), el fallback es un shim de 2 líneas `next/server.js → next/server.ts` que reexporta el subpath `server` completo del paquete `next`. El path del stub es el preferido porque hace el contrato de test explícito.

Después del patch, las 3 entradas de `exclude` se sacan de `vitest.config.ts`. Los 3 tests corren y se espera que pasen (la lógica de test nunca estuvo rota; la falla era en el borde del import).

#### Alcance de los security tests (T-027, Sub-slice C-2)

Los 6 tests son de integración donde es posible (testcontainers de Postgres real en CI; fake-Prisma en dev local) y unitarios donde la integración no es práctica (el timing test necesita hashes reales de Argon2id pero un user repository fake). Los tests son el input para la revisión adversarial en `sdd-verify` de Sub-slice C-2.

#### CI gating (T-028, Sub-slice C-2)

El workflow de CI es el gate autoritativo desde Sub-slice C-2 en adelante. Hasta ahora, `pnpm test` y `pnpm run typecheck` corrían local; CI es la primera vez que el proyecto valida que el lockfile es reproducible en una máquina limpia, los tests son determinísticos en un OS distinto, y el artifact de build matchea las expectativas.

#### ADRs (T-030, Sub-slice C-3)

Cinco ADRs cierran los 5 decision gaps que el design dejó abiertos. Cada ADR es de 40–80 líneas, template MADR, con subsecciones concretas `### Alternatives considered` (no sólo una lista). Son documentos review-facing: un contributor nuevo puede leer `0001` y entender por qué no elegimos Lucia o Clerk sin leer el design.

## Fuera de alcance (este change)

- **Nuevos auth providers** más allá de Google y Credentials (deferido a un futuro change `auth-providers`).
- **Flujo de verificación de email** (deferido; no está en el design).
- **Flujo de password reset** (deferido; no está en el design).
- **Two-factor authentication (2FA)** (deferido; no está en el design).
- **Los 61 `pnpm audit` vulns** del issue #7 (tracking separado; no son específicos de auth).
- **Postgres real en CI** (Slice A deviation #2 lo noted; restaurar testcontainers para `user.repository.test.ts` y los repos de `account`/`session` es una preocupación de Slice D o posterior).
- **Configurar el provider `openrouter` de GGA** que haría que `gga run` funcione local (FLAG-3 del verify del padre; un chore de setup para el user, no código).

## Criterios de aceptación (lo que el reviewer va a ver)

1. `vitest.config.ts#test.exclude` **no** lista los 3 archivos previamente excluidos.
2. `pnpm test` → **137/137 tests verde** en 33 archivos de test.
3. `pnpm run typecheck` → **0 errors**.
4. `pnpm test --coverage` → cobertura en `src/modules/auth/**` **≥ 80%** (líneas, branches, funciones, statements).
5. Los 6 security tests en `src/modules/auth/__tests__/security/` existen y pasan (el test de timing se gate con el flag `--skip-timing` localmente; CI corre la suite completa).
6. `.github/workflows/ci.yml` existe y corre 4 jobs (`lint`, `test`, `build`, `security`); los 4 están verdes en el commit de merge.
7. `.github/CODEOWNERS` lista al maintainer; `docs/branch-protection.md` documenta las reglas.
8. `docs/adr/0001..0005-*.md` existen; `grep -c "^## Decision" docs/adr/*.md` devuelve **5**.
9. `docs/architecture.md` tiene una sección "Auth"; `Documents-es/docs/architecture.md` la mirrorea en el mismo commit.
10. `README.md` tiene una sección de dev local; `Documents-es/README.md` la mirrorea en el mismo commit.
11. `Documents-es/openspec/changes/auth-foundation/apply-progress.md` se actualiza para mirrorar el contenido de Slice B en inglés (cierre de FLAG-2).
12. Las 9 tasks de Slice C (T-025..T-033) flipeadas a `[x]` en `openspec/changes/auth-foundation/tasks.md`.
13. `auth-foundation-slice-c` se cierra vía `sdd-archive` después de que el PR final mergee y `sdd-verify` pase.

## Riesgos y dependencias

- **El fix del module-resolution puede no funcionar** (Opción 1 del issue #18). Si el `resolve.alias` de Vite no cierra el bug, el fallback es la Opción 2 (mockear `next/server` en la config de test) o la Opción 3 (bumpear `next-auth` a un beta más nuevo que arregle el import). Se espera que el worker de sub-slice C-1 verifique en el primer run y haga fallback si es necesario. Documentá qué path se tomó en el handoff.
- **CI corre por primera vez en este proyecto** (no hay CI previa para validar contra). El worker puede necesitar 1–2 iteraciones para que la matrix quede bien (especialmente `pnpm install --frozen-lockfile` con el nuevo pin a `pnpm@11.6.0` y el workaround de `~/pnpm-workspace.yaml`).
- **Los security tests pueden ser flaky en dev local**. El `login.timing.test.ts` necesita una máquina quieta; el flag `--skip-timing` es el escape hatch documentado. Los runners de CI son lo suficientemente quietos como para que el test corra sin el flag.
- **Drift del invariant bilingüe** (FLAG-2 del verify del padre): el mirror español del `apply-progress.md` del change padre está desincronizado. Este change lo re-sincroniza como parte de Sub-slice C-3 (el commit del handoff).
- **El hook de GGA sigue timinando out localmente** (openrouter no está configurado). Por AGENTS.md §2.6, la verificación on-disk es el gate; CI es el gate autoritativo. Documentado en cada handoff desde Slice A.

## Forecast de workload de review (mandatory)

3 PRs chained, cada uno por encima del budget de 400 líneas:

| Sub-slice                               | Líneas (est.) | Overage vs 400 |
| --------------------------------------- | ------------- | -------------- |
| C-1 (module-resolution + T-025 + T-026) | ~200          | 0.5×           |
| C-2 (T-027 + T-028 + T-029)             | ~700          | 1.75×          |
| C-3 (T-030 + T-031 + T-032 + T-033)     | ~400          | 1.0×           |
| **Total**                               | **~1,300**    | —              |

El user aceptó explícitamente el overage en la planificación de Slice B. Lo mismo aplica acá. El overage de C-2 (1.75×) es el más grande por los 6 security tests; la sección de ADRs en C-3 es el deliverable individual más largo.

## Ordenamiento downstream del change

1. `auth-foundation-slice-c` (este change) — cierra Slice C de `auth-foundation`.
2. Después de que este change mergee, `auth-foundation` está completo de implementación (T-001..T-033 hechos). Los pasos siguientes son:
   - Re-verificar `auth-foundation` end-to-end (T-001..T-033, 137/137 tests, todos los 6 security tests, todos los 5 ADRs, CI verde).
   - `sdd-archive` para `auth-foundation` (el change en sí, no este change de slice-c).
   - `sdd-archive` para `auth-foundation-slice-c` (este change).
3. SDD changes desbloqueados después de que `auth-foundation` cierre:
   - `accounts-ledger` — depende de la capacidad auth (usa `auth()` desde `src/modules/auth/index.ts` per T-026).
   - `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy` — la misma dependencia.

## Próximo paso

Después de que el user apruebe esta propuesta, la próxima fase es `sdd-spec`:

- Producir `openspec/changes/auth-foundation-slice-c/spec.md` con entradas de delta-spec para cada una de las 9 tasks + el fix del module-resolution, mirroreado en `Documents-es/openspec/changes/auth-foundation-slice-c/spec.md`.
- Después `sdd-design` (`design.md` con el patrón de Vite alias, la arquitectura de los security tests, la forma del CI workflow).
- Después `sdd-tasks` (un archivo de tasks que rompe cada uno de T-025..T-033 en sub-tasks con columnas de evidencia TDD).
- Después `sdd-apply` (3 PRs chained: C-1, C-2, C-3).
- Después `sdd-verify` (re-correr verify sobre T-001..T-033, esperar `PASS` sin flags).
- Después `sdd-sync` (cerrar los 8 decision gaps que ya estaban cerrados en el design del padre, no hacen falta promociones canonical porque el `openspec/specs/auth/spec.md` canónico ya los cubre).
- Después `sdd-archive` (este change + el change padre).
