# Handoff — `auth-foundation` planning v2 completo

**Estado**: planning cerrado · **Autor**: Sebastián Illa
**Fecha**: 2026-06-10 · **Rama**: `feat/auth-foundation`
**Worktree**: `/Users/sebailla/Documents/Proyectos/2026/gastos-personales-auth-foundation`

## Qué es ahora cierto

Las fases SDD de planning para `auth-foundation` v2 están completas.
La rama `feat/auth-foundation` carga 4 artefactos (proposal, spec,
design, tasks) en inglés con espejos en español, más la
actualización de `openspec/config.yaml` que habilita strict TDD con
el runner de v2.

La próxima fase es `sdd-apply`, que es la **primera** fase que
produce código de producción (TypeScript, schema de Prisma,
configuración de Auth.js, Hono catch-all, tests, CI). `sdd-apply`
**no** es un único commit — es una secuencia de commits atómicos,
guiados por TDD, implementando T-001..T-033, organizados como 3
chained pull requests a `develop`.

## Artefactos de planning (canónicos, en `feat/auth-foundation`)

| Artefacto   | Líneas EN | Líneas ES | Commit SHA    |
| ----------- | --------- | --------- | ------------- |
| Proposal v2 | 512       | 544       | `051e01e`     |
| Spec v2     | 709       | 747       | `0dd2367`     |
| Design v2   | 1.245     | 1.281     | `61a3e5c`     |
| Tasks v2    | 1.456     | 1.481     | `53fcaea`     |
| **Total**   | **3.922** | **4.053** | **4 commits** |

También en `feat/auth-foundation`:

- `eca35c9` — limpieza de los artefactos v1 (Bun + Hono + Drizzle +
  SQLite + auth propia). Los 4 commits v1 (b2a69ec, b562cee,
  17c1635, 3083458) están preservados en git history como
  referencia estructural pero su contenido técnico es OBSOLETO.

## Stack v2 (cerrado)

- **Runtime**: Node.js 20+
- **Framework**: Next.js 16 (App Router, React 19, Server Components)
- **HTTP API**: Hono catch-all en `app/api/[...path]/route.ts`
- **Auth**: Auth.js v5 (`next-auth@5.0.0-beta.X`) + `@auth/prisma-adapter` + database sessions
- **ORM**: Prisma 6
- **Schema validation**: Zod
- **UI**: React 19 + TanStack React Form
- **DB**: PostgreSQL en Neon (free tier, branching, serverless)
- **Deploy**: Fly.io (Dockerfile multi-stage, base `node:20-alpine`)
- **Package manager**: pnpm (NO npm/yarn/bun)
- **Test runner**: Vitest (`pnpm test`)
- **Arquitectura**: por capas + modular

## 8 decision gaps — defaults ACEPTADOS

1. Librería Argon2id: `@node-rs/argon2` (fallback `argon2` npm).
2. Parámetros Argon2id: `memoryCost=19456, timeCost=2, parallelism=1` (verificar con benchmark en slice B).
3. Callback `signIn`: actualizar `lastLoginAt`, emitir evento `UserRegistered` en el primer registro.
4. Path de update de `lastLoginAt`: en callback `signIn`, no en session read.
5. Export del Hono typed-client: `OpenAPIHono` + cliente tipado `hc` en `src/modules/api/client.ts`.
6. UX de `OAuthAccountNotLinked`: la página custom de signIn muestra un mensaje claro.
7. Política de `User.email` ante cambio de email en Google: NO actualizar `User.email` (conservador).
8. Sliding-window: 24 horas (Auth.js default).

## Forecast de chained PRs (por tasks, las líneas exceden el budget de 400)

| Slice                                                        | Tasks        | Líneas     | Overage vs 400 |
| ------------------------------------------------------------ | ------------ | ---------- | -------------- |
| A — Floor + infra + auth domain + auth infrastructure        | T-001..T-018 | ~1.450     | 3,6×           |
| B — Auth application + Hono catch-all + UI + app composition | T-019..T-024 | ~500       | 1,25×          |
| C — Security tests + CI + docs + handoff                     | T-025..T-033 | ~700       | 1,75×          |
| **Total**                                                    | **33**       | **~2.650** | —              |

El usuario aceptó explícitamente el overage en esta sesión. El
worker de apply tiene la instrucción de surface los números reales
de `git diff --stat` al apply time; el padre decide si
re-forecasteamos a 5 slices si el reviewer empuja para atrás.

## Lo que NO está hecho todavía (diferido a la próxima sesión)

No son "commits faltantes" — son la próxima fase SDD (`sdd-apply`)
que produce **código de producción**, no artefactos de planning.
Requieren una sesión de trabajo aparte, idealmente después de que
el usuario cree el remote de GitHub para que los chained PRs
tengan target.

1. Crear el remote de GitHub en `github.com/<usuario>/gastos-personales`
   y agregarlo como `origin`.
2. Pushear la rama de planning: `git push -u origin feat/auth-foundation`.
3. Abrir los chained PRs: `feat/auth-foundation → develop`. El
   `HANDOFF.md` y los 4 artefactos de planning vienen como
   commits del primer PR; los PRs subsiguientes llevan el código
   de los slices A/B/C.
4. Adversarial reviewer (fresh context) antes de cada merge.
5. Después de que los 3 slices mergeen, correr `sdd-verify`
   (definition of done por slice), luego `sdd-sync` (actualizar
   `openspec/specs/` si hace falta), luego `sdd-archive` (mover
   `openspec/changes/auth-foundation/` a `archive/`).
6. Los 6 cambios SDD restantes (desbloqueados después de
   auth-foundation): `accounts-ledger`, `fx-cache`,
   `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy`.
   Cada uno es su propio ciclo proposal → spec → design → tasks.

## Checklist pre-apply para la próxima sesión

Cuando arranque la próxima sesión y el usuario esté listo para
empezar `sdd-apply`, el orquestador padre va a:

1. `cd /Users/sebailla/Documents/Proyectos/2026/gastos-personales-auth-foundation`
2. Verificar que `git status` esté limpio (debería estarlo — este
   handoff es el único archivo nuevo sin trackear en este punto;
   se commitea con el commit del siguiente paso, ver abajo).
3. Verificar que el remote exista, luego `git push -u origin feat/auth-foundation`.
4. Releer los 4 artefactos en orden: proposal, spec, design, tasks.
5. Cargar las skills: `architecture-standards`, `auth-rbac`,
   `api-design`, `database-strategy`, `error-handling`,
   `env-config`, `security-owasp`, `testing-standards`,
   `ci-cd-pipeline`, `estrategia-git`, `deployment`.
6. Delegar `sdd-apply` Slice A a un subagente `worker` con el
   runner `pnpm test` (strict TDD) ahora activo en
   `openspec/config.yaml`.

## Convenciones preservadas (se vuelven a chequear en apply)

- Autor: `Sebastián Illa` (por `openspec/AGENTS.md` y observación
  Engram `gastos-personales/conventions/author-attribution`).
- Sin atribución de IA en ningún commit, archivo, o body de PR.
- Conventional Commits format.
- Invariante bilingüe: cada Markdown inglés + espejo español en
  el mismo commit (por `AGENTS.md` §13.3).
- Git Flow: `main` inmutable, `develop` integración, worktrees
  desde `develop` con prefijos `feat/*`/`fix/*`.
- GGA pre-commit gate (Husky).
- `pnpm install --frozen-lockfile` en CI (sin npm/yarn/bun).
- Strict TDD: RED → GREEN → REFACTOR por task, ≥80% coverage en
  `src/modules/auth/**` y `src/shared/db/**`.
