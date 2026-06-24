# Tasks — `auth-foundation-slice-c`

**Autor**: Sebastián Illa
**Change**: `auth-foundation-slice-c`
**Estado**: listo-para-apply · **Creado**: 2026-06-13
**Upstream**: `openspec/changes/auth-foundation-slice-c/proposal.md` (aprobado) ·
`openspec/changes/auth-foundation-slice-c/spec.md` (16 deltas, aprobado) ·
`openspec/changes/auth-foundation-slice-c/design.md` (8 secciones, aprobado)
**Change padre**: `auth-foundation` (Slice A + B mergeadas como PRs #5, #17)
**Branch objetivo**: `feat/auth-foundation-slice-c-c1` → `develop` (después C-2, después C-3)
**Estrategia de PR**: 3 PRs chained en 3 sub-slices (C-1 → C-2 → C-3); ver "Review workload forecast"
**Preflight**: interactive · `both` (OpenSpec + Engram) · `auto-forecast` · budget 400 líneas
**Stack v2 (heredado)**: Next.js 16 + Node 20 + Hono catch-all + Auth.js v5 + `@auth/prisma-adapter` + Prisma 6 + PostgreSQL + Zod + Vitest + pnpm

> **Notas de cierre**:
>
> - **FLAG-1 (CRÍTICO)**: el module-resolution bug (issue #18) mantiene 3 test files excluidos en `vitest.config.ts`. C-1 lo cierra con un patch de Vite `resolve.alias` + stub de 30 líneas. Target: 137/137 tests verde, coverage ≥ 80% en `src/modules/auth/**`.
> - **FLAG-2 (WARNING)**: drift bilingüe en `Documents-es/openspec/changes/auth-foundation/apply-progress.md` (stale en Slice A solamente). C-3 lo cierra como parte del commit de handoff.

## Objetivo

Cerrar las 9 tasks restantes (T-025..T-033) del change padre `auth-foundation`, más el FLAG-1 CRÍTICO del verify del change padre (module-resolution bug, issue #18) y el FLAG-2 WARNING (drift bilingüe). Cuando `sdd-apply` termine:

- 137/137 tests verde (134/134 + 3 re-incluidos).
- Coverage en `src/modules/auth/**` ≥ 80%.
- 6 security tests implementados y pasando.
- CI workflow con 4 jobs paralelos (lint, test, build, security).
- Branch protection + CODEOWNERS documentados.
- 5 ADRs en `docs/adr/`.
- `docs/architecture.md` + `README.md` actualizados (mirrors EN + ES).
- `Documents-es/openspec/changes/auth-foundation/apply-progress.md` re-sincronizado.
- Las 9 tasks de Slice C + module-resolution fix flipeadas a `[x]` en el `tasks.md` del change padre.

---

## Sub-slice C-1 (PR 1) — Module-resolution + catch-all + middleware + public API

### Lista de tasks de C-1

- [ ] **T-C1.0** Module-resolution fix (cierre de FLAG-1, issue #18)

  - **Scope (RED → GREEN)**: agregar un `resolve.alias` en `vitest.config.ts` que mapea `'next/server'` a un stub de 30 líneas en `test/stubs/next-server.ts`. El stub provee `NextRequest`, `NextResponse` y `userAgent` no-ops (sólo para tests; producción usa el `next/server` real). Quitar las 3 entradas del `test.exclude` (los archivos previamente excluidos ahora corren). Verificar: `npx vitest run` → 137/137 verde, `npx vitest run --coverage` → coverage en `src/modules/auth/**` ≥ 80%.
  - **Files**: `vitest.config.ts` (+~10 líneas para el alias + remover 3 entradas del exclude), `test/stubs/next-server.ts` (archivo nuevo, ~30 líneas)
  - **Lines estimate**: 40
  - **Depends on**: Slice A + B + chores ya mergeadas (`develop` HEAD ≥ `c84b4ee`)
  - **Tests**: 0 tests nuevos; **re-include** 3 tests existentes que previamente fallaban al import: `src/modules/auth/infrastructure/external/authjs.test.ts`, `src/modules/auth/index.test.ts`, `app/api/auth/[...nextauth]/route.test.ts`
  - **Verify**:
    ```bash
    npx vitest run
    # → 137/137 passed in 33 test files
    npx vitest run --coverage
    # → Coverage en src/modules/auth/** ≥ 80% (lines, branches, functions, statements)
    ```
  - **Fallback** (si el stub es insuficiente): bumpear `next-auth@5.0.0-beta.32+` cuando esté disponible. Documentar en el handoff; el parent decide.

- [ ] **T-025** Mount `app/api/[...path]/route.ts` (Hono catch-all)

  - **Scope (RED → GREEN)**: la ruta delega GET/POST/PATCH/DELETE a `honoApp.fetch(request)`. Precedencia de routing: el file-based routing de Next.js matchea `app/api/auth/[...nextauth]/route.ts` ANTES que `app/api/[...path]/route.ts` (la ruta más específica gana). Tests verifican: 1) `GET /api/me` sin sesión → 401, 2) `GET /api/auth/signin` → devuelve la respuesta HTML de Auth.js (NO el JSON de Hono).
  - **Files**:
    - `app/api/[...path]/route.ts` (~30 líneas)
    - `app/api/[...path]/route.test.ts` (integration test, ~50 líneas; usa `child_process.spawn` para arrancar `next dev` y `fetch` contra él)
  - **Lines estimate**: 80
  - **Depends on**: T-021 (Hono app), T-024 (Auth.js mount), T-C1.0 (module-resolution fix)
  - **Tests**: 2 cases. Patrón AAA. Ambos son integration tests contra un Next.js server real.
  - **Verify**:
    ```bash
    pnpm test app/api/
    # → 2 cases pass
    pnpm run build
    # → exits 0
    ```

- [ ] **T-026** Public API export (`src/modules/auth/index.ts`) + Next.js middleware
  - **Scope (RED → GREEN)**: `src/modules/auth/index.ts` exporta `auth`, `signIn`, `signOut`, `handlers`, `honoApp`, `UserRegistered`, `UserSignedIn`. `tsconfig.json` tiene `verbatimModuleSyntax: true` así que los imports no exportados fallan en compile time. `middleware.ts` en la raíz del proyecto exporta un handler default `auth((request) => ...)` que 302-redirecciona las requests no autenticadas a `/auth/signin`. Tests verifican: 1) compile-time check de los named exports, 2) 302 redirect para `/dashboard` no autenticado, 3) 200 para `/dashboard` autenticado.
  - **Files**:
    - `src/modules/auth/index.ts` (~30 líneas)
    - `src/modules/auth/index.test.ts` (compile-time check, ~20 líneas)
    - `middleware.ts` en la raíz del proyecto (~20 líneas)
  - **Lines estimate**: 70
  - **Depends on**: T-018 (authjs), T-021 (Hono app), T-025 (catch-all), T-C1.0
  - **Tests**: 3 cases. Patrón AAA.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/index.test.ts
    # → 1 case passes (compile-time check)
    pnpm run typecheck
    # → 0 errors
    pnpm test middleware.test.ts  # o inline
    # → 2 cases pass (302 redirect + 200)
    ```

### Acceptance de C-1

- [ ] `vitest.config.ts#test.exclude` ya no lista los 3 archivos previamente excluidos
- [ ] `pnpm test` → 137/137 verde
- [ ] `pnpm test --coverage` → coverage en `src/modules/auth/**` ≥ 80%
- [ ] `app/api/[...path]/route.test.ts` pasa
- [ ] `src/modules/auth/index.test.ts` pasa (compile-time check)
- [ ] `middleware.ts` 302 redirect test pasa
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run build` → exits 0

---

## Sub-slice C-2 (PR 2) — Security tests + CI + branch protection

### Lista de tasks de C-2

- [ ] **T-027.1** Security test: timing equalization (`login.timing.test.ts`)

  - **Scope (RED → GREEN)**: 30 paired samples de `authorize()` con `known@example.com + wrong password` vs `unknown@example.com + any password`. Welch's t-test, p > 0.01. El test corre en CI; local dev puede `SKIP_TIMING=true pnpm test` para skipearlo. Real Argon2id runtime (in-process vía `@node-rs/argon2`).
  - **Files**: `src/modules/auth/__tests__/security/login.timing.test.ts` (~80 líneas)
  - **Lines estimate**: 80
  - **Depends on**: T-014 (auth.service con timing equalization)
  - **Tests**: Welch's t-test, 60 paired samples (30 + 30). Assert p > 0.01.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/login.timing.test.ts
    # → p > 0.01
    SKIP_TIMING=true pnpm test
    # → test skipped, suite green
    ```

- [ ] **T-027.2** Security test: OAuth state CSRF (`oauth.state-csrf.test.ts`)

  - **Scope (RED → GREEN)**: simular callback de Auth.js con `state` parameter tampering. Assert: ninguna fila `User` creada, ninguna fila `Account` insertada, respuesta de error.
  - **Files**: `src/modules/auth/__tests__/security/oauth.state-csrf.test.ts` (~40 líneas)
  - **Lines estimate**: 40
  - **Depends on**: T-018 (authjs wiring)
  - **Tests**: 3 cases (tampered state, missing state, valid state). Assert row counts.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/oauth.state-csrf.test.ts
    # → 3 cases pass
    ```

- [ ] **T-027.3** Security test: secrets in logs (`secrets.in-logs.test.ts`)

  - **Scope (RED → GREEN)**: capturar log output durante register, OAuth callback, y session-resolution paths. Inyectar `password`, `refresh_token`, `Authorization: Bearer <jwt>`, `id_token`, y CSRF token. Assert: ninguno de esos valores aparece en el log capturado. Refinamiento end-to-end de BR-AUTH-11.
  - **Files**: `src/modules/auth/__tests__/security/secrets.in-logs.test.ts` (~50 líneas)
  - **Lines estimate**: 50
  - **Depends on**: T-007 (logger con denylist)
  - **Tests**: 4 scenarios (password, refresh_token, Bearer, id_token). Nested-object redaction.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/secrets.in-logs.test.ts
    # → 4 scenarios pass
    ```

- [ ] **T-027.4** Security test: origin-check (`origin-check.test.ts`)

  - **Scope (RED → GREEN)**: `POST /api/auth/register` con `Origin: https://attacker.com` → 403 `FORBIDDEN`. Same-origin POST → no 403.
  - **Files**: `src/modules/auth/__tests__/security/origin-check.test.ts` (~40 líneas)
  - **Lines estimate**: 40
  - **Depends on**: T-021 (Hono origin-check middleware)
  - **Tests**: 2 cases (cross-origin + same-origin).
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/origin-check.test.ts
    # → 2 cases pass
    ```

- [ ] **T-027.5** Security test: Argon2id parameters (`argon2.parameters.test.ts`)

  - **Scope (RED → GREEN)**: 30 calls a `hashArgon2id(password)`. Median runtime en [50, 100] ms en CI runner. Real Argon2id runtime. Falla el test si el runtime está fuera del rango.
  - **Files**: `src/modules/auth/__tests__/security/argon2.parameters.test.ts` (~40 líneas)
  - **Lines estimate**: 40
  - **Depends on**: T-012 (argon2.hasher), T-027.1 (timing test sets the pattern)
  - **Tests**: 30 calls; assert median en [50, 100] ms.
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/argon2.parameters.test.ts
    # → median en [50, 100] ms
    ```

- [ ] **T-027.6** Security test: cookie attributes (`cookie.attributes.test.ts`)

  - **Scope (RED → GREEN)**: capturar `Set-Cookie: authjs.session-token=...` header. Assert: `HttpOnly`, `SameSite=Lax` siempre. `Secure` en producción (`NODE_ENV=production`).
  - **Files**: `src/modules/auth/__tests__/security/cookie.attributes.test.ts` (~40 líneas)
  - **Lines estimate**: 40
  - **Depends on**: T-018 (authjs)
  - **Tests**: 4 cases (HttpOnly, SameSite=Lax, Secure-in-prod, missing-Secure-in-dev).
  - **Verify**:
    ```bash
    pnpm test src/modules/auth/__tests__/security/cookie.attributes.test.ts
    # → 4 cases pass
    ```

- [ ] **T-028** Author `.github/workflows/ci.yml`

  - **Scope**: 4 jobs paralelos:
    1. **`lint`**: `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run typecheck`
    2. **`test`**: `pnpm install --frozen-lockfile`, `pnpm prisma migrate deploy` (con `services: postgres:` en el workflow), `pnpm test --coverage`, upload coverage artifact
    3. **`build`**: `pnpm install --frozen-lockfile`, `pnpm run build`
    4. **`security`**: `pnpm test src/modules/auth/__tests__/security/`
  - Triggers: `on: pull_request: { branches: [develop, main] }` y `on: push: { branches: [develop, main] }`. Concurrency cancela in-flight runs del mismo ref.
  - **Files**: `.github/workflows/ci.yml` (~90 líneas, YAML)
  - **Lines estimate**: 90
  - **Depends on**: T-027.1..T-027.6 (los security tests deben existir antes de que CI los corra)
  - **Tests**: N/A (CI es el test)
  - **Verify**: pushear la branch triggerea el workflow; el link "docs" del PR muestra el green check.

- [ ] **T-029** Branch protection + `CODEOWNERS`
  - **Scope**: `.github/CODEOWNERS` en la raíz del repo apuntando al maintainer (`@sebailla`). `docs/branch-protection.md` describe las reglas: 1 review required, CI green, dismiss stale approvals on push, linear history, no force-pushes. La configuración real de GitHub branch-protection la aplica manualmente el user (no en este change).
  - **Files**:
    - `.github/CODEOWNERS` (~5 líneas)
    - `docs/branch-protection.md` (~25 líneas)
  - **Lines estimate**: 30
  - **Depends on**: T-028 (el CI workflow debe existir antes de que branch protection lo requiera)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    cat .github/CODEOWNERS
    # → lista @sebailla
    cat docs/branch-protection.md
    # → describe las 5 reglas
    ```

### Acceptance de C-2

- [ ] Los 6 security tests implementados en `src/modules/auth/__tests__/security/`
- [ ] Los 6 security tests pasan en CI
- [ ] `SKIP_TIMING=true` skipea test #1 solamente, los otros 5 corren
- [ ] `.github/workflows/ci.yml` existe con 4 jobs paralelos
- [ ] El CI workflow triggerea en `pull_request` a `develop` o `main` y en `push` a `develop` o `main`
- [ ] `.github/CODEOWNERS` lista `@sebailla`
- [ ] `docs/branch-protection.md` describe las 5 reglas
- [ ] `pnpm test src/modules/auth/__tests__/security/` → 6/6 verde localmente
- [ ] `pnpm run lint`, `pnpm run typecheck`, `pnpm test`, `pnpm run build` → todos pasan localmente

---

## Sub-slice C-3 (PR 3) — Docs + handoff

### Lista de tasks de C-3

- [ ] **T-030** Cinco ADRs (Auth.js v5, Prisma 6, Argon2id, Hono catch-all, auto-link)

  - **Scope**: 5 ADRs en `docs/adr/`, MADR template (Context, Decision Drivers, Considered Options, Decision Outcome, Consequences, Confirmation). Cada ADR tiene 3+ alternativas.
  - **Files**:
    - `docs/adr/0001-authjs-v5.md` (~30 líneas)
    - `docs/adr/0002-prisma-6.md` (~30 líneas)
    - `docs/adr/0003-argon2id-parameters.md` (~30 líneas)
    - `docs/adr/0004-hono-catch-all.md` (~30 líneas)
    - `docs/adr/0005-auto-link-security-model.md` (~30 líneas)
  - **Lines estimate**: 150
  - **Depends on**: T-012 (argon2.hasher), T-018 (authjs), T-021 (Hono app)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    ls docs/adr/
    # → 5 ADRs presentes
    grep -c "^## Decision" docs/adr/*.md
    # → 5 (uno por ADR)
    ```

- [ ] **T-031** Update `docs/architecture.md` (Auth section) + Spanish mirror

  - **Scope**: agregar una sección "Auth" a `docs/architecture.md` con: diagrama Mermaid de alto nivel (el mismo del §1 del design), resumen del data model (4 modelos Prisma, 3 columnas añadidas, constraint unique en `Account`), 8 rutas de Auth.js + 3 rutas de Hono, estrategia de sesión (database sessions, 30-day sliding, no JWT), auto-link security model, cross-module contracts (`auth()` helper, `User` como identity anchor, eventos `UserRegistered` / `UserSignedIn`). Mirror español en `Documents-es/docs/architecture.md` actualizado en el mismo commit.
  - **Files**:
    - `docs/architecture.md` (+~150 líneas)
    - `Documents-es/docs/architecture.md` (+~150 líneas, mirror)
  - **Lines estimate**: 300 (150 + 150)
  - **Depends on**: T-030 (ADRs)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    grep -c "## Auth" docs/architecture.md
    # → 1
    grep -c "## Auth" Documents-es/docs/architecture.md
    # → 1
    # El diagrama Mermaid renderiza
    ```

- [ ] **T-032** Update `README.md` (local dev) + Spanish mirror

  - **Scope**: agregar una sección "Local dev" a `README.md` con: `pnpm install`, setup de Postgres (`docker compose up -d postgres` o Neon free-tier), `pnpm dev`, `pnpm test`, `pnpm test -- src/modules/auth/__tests__/security/`, flag `SKIP_TIMING=true` para desarrollo local ruidoso. Mirror español en `Documents-es/README.md` actualizado en el mismo commit.
  - **Files**:
    - `README.md` (+~30 líneas)
    - `Documents-es/README.md` (+~30 líneas, mirror)
  - **Lines estimate**: 60 (30 + 30)
  - **Depends on**: T-031 (architecture.md Auth section)
  - **Tests**: N/A
  - **Verify**:
    ```bash
    grep -c "## Local dev" README.md
    # → 1
    grep -c "## Local dev" Documents-es/README.md
    # → 1
    ```

- [ ] **T-033** Final commit, push, open PR, request reviewer (handoff)
  - **Scope**: 3 commits atómicos para el PR de C-3:
    1. `docs(adr): add 5 ADRs for auth-foundation decisions` (T-030)
    2. `docs(architecture): add Auth section + Spanish mirror` (T-031, incluye el cierre de FLAG-2: re-sync `Documents-es/openspec/changes/auth-foundation/apply-progress.md` para mirrorear el contenido inglés de Slice B)
    3. `docs(readme): add local-dev section + Spanish mirror` (T-032, incluye el write a `apply-progress.md` para flipear T-025..T-033 a `[x]`)
    4. `docs(openspec): log C-3 apply-progress with TDD evidence` (el 9º commit, el log de C-3 apply-progress)
  - **Files**:
    - `docs/adr/0001..0005-*.md` (5 archivos nuevos, T-030)
    - `docs/architecture.md` (+~150 líneas, T-031)
    - `Documents-es/docs/architecture.md` (+~150 líneas, T-031 mirror)
    - `README.md` (+~30 líneas, T-032)
    - `Documents-es/README.md` (+~30 líneas, T-032 mirror)
    - `openspec/changes/auth-foundation/tasks.md` (flipear T-025..T-033 a `[x]`)
    - `openspec/changes/auth-foundation/apply-progress.md` (agregar sección C-3)
    - `openspec/changes/auth-foundation/HANDOFF.md` (handoff final)
    - `Documents-es/openspec/changes/auth-foundation/apply-progress.md` (cierre de FLAG-2: re-sync contenido de Slice B)
  - **Lines estimate**: 600 (acumulado para los 3 commits de C-3 PR + el commit de apply-progress)
  - **Depends on**: T-030, T-031, T-032
  - **Tests**: N/A (handoff)
  - **Verify**:
    ```bash
    git log origin/develop..HEAD
    # → 9 commits para Slice C (3 para C-1, 3 para C-2, 3 para C-3, más apply-progress)
    # → 1 commit para el cierre de FLAG-2
    grep "^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*" openspec/changes/auth-foundation/tasks.md | wc -l
    # → 9
    ```

### Acceptance de C-3

- [ ] 5 ADRs en `docs/adr/`, cada una con `### Decision` + `### Considered Options` (3+ alternativas cada una)
- [ ] `docs/architecture.md` tiene una sección "Auth" con el diagrama Mermaid
- [ ] `Documents-es/docs/architecture.md` mirrorea la sección Auth
- [ ] `README.md` tiene una sección "Local dev" con el flag `SKIP_TIMING` documentado
- [ ] `Documents-es/README.md` mirrorea la sección local-dev
- [ ] `Documents-es/openspec/changes/auth-foundation/apply-progress.md` está actualizado para incluir el contenido de Slice B (cierre de FLAG-2)
- [ ] Las 9 tasks de Slice C (T-025..T-033) + T-C1.0 están flipeadas a `[x]` en `openspec/changes/auth-foundation/tasks.md`
- [ ] `openspec/changes/auth-foundation-slice-c/apply-progress.md` está actualizado con TDD evidence para C-1, C-2, C-3
- [ ] `openspec/changes/auth-foundation-slice-c/HANDOFF.md` está escrito

---

## Forecast de review workload (mandatorio)

| Sub-slice                                                     | Tasks                                             | Líneas estimadas | Overage vs budget 400     |
| ------------------------------------------------------------- | ------------------------------------------------- | ---------------- | ------------------------- |
| C-1 (module-resolution + catch-all + middleware + public API) | T-C1.0, T-025, T-026                              | ~200             | **0.5× (¡bajo budget!)**  |
| C-2 (security tests + CI + branch protection)                 | T-027.1..6, T-028, T-029                          | ~400             | 1.0× (justo en el budget) |
| C-3 (ADRs + architecture.md + README + handoff)               | T-030, T-031, T-032, T-033                        | ~600             | 1.5×                      |
| **Total**                                                     | 14 tasks (T-C1.0 + 9 Slice C + 4 handoff commits) | ~1,200           | —                         |

C-1 está **bajo** el budget de 400. C-2 justo en el budget. C-3 arriba pero el user ya aceptó overage para el change padre.

Los 3 PRs chained van secuenciados C-1 → C-2 → C-3.

---

## Riesgos específicos del apply

- **Insuficiencia del stub de module-resolution**: si `next-auth` llama al runtime real de `next/server` en tiempo de test, el stub falla. Fallback: bumpear `next-auth@5.0.0-beta.32+` o patchear Vite diferente. El apply worker de C-1 reporta si el stub es insuficiente.
- **CI Postgres service** (`services: postgres:` en el workflow): los GitHub-hosted runners pueden flaquear en ciertas imágenes. Fallback: Neon free-tier branch en un env var `DATABASE_URL` separado.
- **Confiabilidad del test de timing**: ruidoso en Mac. El env var `SKIP_TIMING=true` lo maneja localmente; CI corre la suite completa.
- **Cierre del drift bilingüe** (FLAG-2): el worker de C-3 debe actualizar el `apply-progress.md` español atómicamente con el handoff de C-3. Si lo olvida, el verify lo re-flagea.
- **GGA pre-commit gate**: openrouter no configurado en `~/.pi/agent/auth.json` (igual que Slice A + B). La verificación on-disk es el gate per AGENTS.md §2.6. CI es el authoritative gate.
- **Husky pre-commit `check-lockfile.sh`** (PR #9): si el lockfile no se commitea junto con `package.json`, el commit falla. El worker de C-2 debe regenerar y commitear el lockfile cuando agregue el CI workflow (que no toca `package.json` directamente, pero el archivo de workflow es YAML así que el check pasa).
- **Los 61 vulns de pnpm audit** (issue #7) siguen abiertos. Este change no los aborda.

---

## Fuera de scope (este change)

- Los 61 vulns de pnpm audit (issue #7, tracking separado).
- Email verification flow (deferido a un future change).
- Password reset flow (deferido a un future change).
- 2FA (deferido a un future change).
- Nuevos auth providers más allá de Google y Credentials.
- Los SDD changes `accounts-ledger`, `transactions`, `fx-cache`, `networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy`.

---

## Definition of done

`auth-foundation-slice-c` se cierra cuando TODOS los siguientes son verdaderos:

- [ ] Las 14 tasks (T-C1.0 + T-025..T-033) están flipeadas a `[x]` en `openspec/changes/auth-foundation-slice-c/tasks.md`
- [ ] Las 14 tasks están flipeadas a `[x]` en `openspec/changes/auth-foundation/tasks.md` (el tasks file del change padre)
- [ ] `openspec/changes/auth-foundation-slice-c/apply-progress.md` tiene TDD evidence para las 14 tasks (columnas RED, GREEN, TRIANGULATE, REFACTOR)
- [ ] `pnpm test` → **137/137** verde (era 134/134 con 3 excluidos)
- [ ] `pnpm test --coverage` → coverage en `src/modules/auth/**` ≥ 80%
- [ ] `pnpm run typecheck` → 0 errors
- [ ] `pnpm run build` → exits 0
- [ ] `pnpm test src/modules/auth/__tests__/security/` → 6/6 verde (o `SKIP_TIMING=true` para el timing test localmente)
- [ ] `.github/workflows/ci.yml` corre 4 jobs y está green en el merge commit
- [ ] `.github/CODEOWNERS` lista `@sebailla`
- [ ] `docs/branch-protection.md` describe las 5 reglas
- [ ] 5 ADRs en `docs/adr/` con `### Decision` + `### Considered Options`
- [ ] `docs/architecture.md` tiene sección Auth + mirror español
- [ ] `README.md` tiene sección local-dev + mirror español
- [ ] `Documents-es/openspec/changes/auth-foundation/apply-progress.md` está re-sincronizado (cierre de FLAG-2)
- [ ] `sdd-verify` pasa en el merge commit
- [ ] `sdd-sync` corre para promover los 16 deltas al spec canónico `openspec/specs/auth/spec.md`
- [ ] `auth-foundation-slice-c` se cierra vía `sdd-archive` (movido a `openspec/changes/archive/`)
- [ ] El change padre `auth-foundation` también se archiva (ahora que las 33 tasks están done)
