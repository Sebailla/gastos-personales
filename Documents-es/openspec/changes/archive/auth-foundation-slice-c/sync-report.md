# Sync Report — `auth-foundation-slice-c`

**Autor**: Sebastián Illa
**Change**: `auth-foundation-slice-c`
**Estado**: sincronizado · **Fecha**: 2026-06-14
**Target del sync**: `openspec/specs/auth/spec.md` (canónico, EN) + `Documents-es/openspec/specs/auth/spec.md` (mirror ES)
**SHA del spec pre-sync**: `e7d5d35` (último sync antes de este commit; el spec canónico se escribió por última vez el 2026-06-10 como v2 "borrador")
**SHA del commit de sync**: ver "Commits" abajo (el SHA que aterrizó los cambios del spec es el segundo de los 3 commits del lifecycle)

> **Objetivo**: promover los 16 spec deltas de `openspec/changes/auth-foundation-slice-c/spec.md` al spec canónico `openspec/specs/auth/spec.md` como una única actualización coherente. Un reviewer leyendo el spec canónico 6 meses desde ahora no debería necesitar consultar el archivo de deltas.

---

## 1. Deltas promovidos (11 de 16)

| #          | Título                                 | Sección target en el spec canónico                                                                                   | Tipo                                                 |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| DELTA-C1.1 | Fix de resolución de módulo            | `Cross-module contracts > Test configuration` (nueva subsección)                                                     | conductual (infra de test)                           |
| DELTA-C2.1 | Hono catch-all                         | `Endpoints > Application-owned (Hono, under /api/*)` (extendida con precedencia de routing + restricción de runtime) | conductual (routing + runtime)                       |
| DELTA-C2.2 | Export del API público                 | `Cross-module contracts > Module index and public API` (extendida con los 7 named exports)                           | conductual (superficie de API)                       |
| DELTA-C2.3 | Middleware de Next.js                  | `Cross-module contracts > App Router middleware` (nueva subsección)                                                  | conductual (protección de páginas)                   |
| DELTA-C2.4 | Test de seguridad: timing equalization | `Security guarantees > Security test coverage` (nueva subsección, fila #1)                                           | conductual (asserta contrato BR-AUTH-4)              |
| DELTA-C2.5 | Test de seguridad: OAuth state CSRF    | `Security guarantees > Security test coverage` (nueva subsección, fila #2)                                           | conductual (asserta contrato BR-AUTH-6)              |
| DELTA-C2.6 | Test de seguridad: secretos en logs    | `Security guarantees > Security test coverage` (nueva subsección, fila #3)                                           | conductual (asserta contrato BR-AUTH-11)             |
| DELTA-C2.7 | Test de seguridad: origin-check        | `Security guarantees > Security test coverage` (nueva subsección, fila #4)                                           | conductual (asserta contrato de la sección CSRF)     |
| DELTA-C2.8 | Test de seguridad: parámetros Argon2id | `Security guarantees > Security test coverage` (nueva subsección, fila #5)                                           | conductual (asserta contrato BR-AUTH-3)              |
| DELTA-C2.9 | Test de seguridad: atributos de cookie | `Security guarantees > Security test coverage` (nueva subsección, fila #6)                                           | conductual (asserta contrato de atributos de cookie) |
| DELTA-C3.1 | Workflow de CI                         | `Cross-module contracts > Continuous integration` (nueva subsección)                                                 | conductual (proceso + tooling)                       |
| DELTA-C3.2 | Branch protection + CODEOWNERS         | `Cross-module contracts > Repository governance` (nueva subsección, parcial — CODEOWNERS + doc de branch-protection) | conductual (proceso + tooling)                       |

**11 de 16 deltas promovidos.** Los 5 restantes (DELTA-C3.3, C3.4, C3.5, C3.6) son doc-only o process-only y no se promueven al spec de runtime; ver §2.

### Promociones adicionales más allá de los 16 deltas

El sync también recogió tres items que el verify report flageó como inconsistencias spec/código. Estos no son nuevos comportamientos; son correcciones al spec para matchear el código real:

1. **Restricción de runtime** (`runtime: 'nodejs'` para el Hono catch-all, la ruta de Auth.js, y el middleware). Agregado a la sección `Application-owned (Hono, under /api/*)` y a la nueva subsección `App Router middleware`. Razón: los binarios NAPI de `@node-rs/argon2` no se pueden cargar en el runtime Edge. Sin `runtime: 'nodejs'`, el build de producción de Next.js falla.
2. **Comportamiento del matcher del middleware** — el escenario 3 de DELTA-C2.3 del spec decía "el middleware DEBE ser un no-op para `/api/*`" pero el matcher real es `/((?!_next|api/auth|favicon.ico).*)`, que **sí** corre en `/api/*`. El sync actualiza la subsección `App Router middleware` para describir el comportamiento real del matcher (el matcher excluye solo `_next`, `api/auth`, `favicon.ico`; la resolución `auth()` del route handler de Hono es el camino autoritativo de 401 para las requests de API).
3. **Nota sobre el conteo de tests** — agregado un párrafo "Test method note" en la subsección `Security test coverage` que nombra los 3 tests de static check (DELTA-C2.5, DELTA-C2.8, DELTA-C2.9) explícitamente y explica por qué usan `vi.mock` + static checks de texto de fuente en lugar de ejercitar el flujo vivo de Auth.js. Esto es consistente con el FLAG-V3 del verify report.

---

## 2. Deltas no promovidos (5 de 16)

| #          | Título                           | Razón para no promover                                                                                                                                                                                                                                                |
| ---------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DELTA-C3.3 | ADRs (5 en `docs/adr/`)          | doc-only. Los ADRs documentan decisiones, no comportamiento de runtime. El spec describe el **qué** (el runtime); los ADRs describen el **por qué**. Cross-referenciados en la nueva subsección `Repository governance` (§1 DELTA-C3.2) y en la sección `References`. |
| DELTA-C3.4 | Update de `docs/architecture.md` | doc-only. La sección "Auth" es un mapa de alto nivel; el spec es el contrato. Cross-referenciada en la nueva sección `References`.                                                                                                                                    |
| DELTA-C3.5 | Update de `README.md`            | doc-only. La sección "Local dev" es operator-facing; el spec es contract-facing. Cross-referenciada en la nueva sección `References`.                                                                                                                                 |
| DELTA-C3.6 | Cierre de drift bilingüe         | process-only. Este delta es sobre re-sincronizar un mirror en español, no sobre agregar un nuevo contrato. El mirror ya está current; el spec está silencioso sobre la salud de los doc-mirrors (eso es una meta-concern, no una concern de runtime).                 |

Estos 4 deltas doc-only están listados en la nueva sección `References` del spec canónico, con paths. Un lector que quiera las decisiones de arquitectura puede seguir el path; un lector que quiera el contrato se queda en el spec.

DELTA-C3.2 se spliteó: la parte del workflow de CI se promovió (subsección `Continuous integration`); la parte de los ADRs no (cross-referenciada en `Repository governance`).

---

## 3. Resumen del diff

Spec canónico pre-sync: **709 líneas**.
Spec canónico post-sync: **892 líneas**.
Delta neto: **+183 líneas, -0 líneas** (el spec creció; no se borró contenido existente).

Mirror español pre-sync: **738 líneas**.
Mirror español post-sync: **923 líneas**.
Delta neto: **+185 líneas, -0 líneas**.

`git diff --stat` entre el spec pre-sync y post-sync (en el archivo `openspec/specs/auth/spec.md`):

```text
openspec/specs/auth/spec.md | 183 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
1 file changed, 174 insertions(+), 9 modifications(-)
```

Mirror español:

```text
Documents-es/openspec/specs/auth/spec.md | 185 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
1 file changed, 176 insertions(+), 9 modifications(-)
```

(Las "9 modifications" son los cambios del header de metadata: campo `Source change`, `Status: draft → active`, `Last sync: 2026-06-14 (Slice C)`.)

Las 5 nuevas subsecciones (bajo "Security guarantees" y "Cross-module contracts") suman ~140 líneas. Las ~35 líneas restantes son la nota de la restricción de runtime, la clarificación del matcher del middleware, la nota del método de test, la sección `References`, y ajustes menores de prosa.

---

## 4. Campo `Source change`

El header de metadata del spec ahora lista ambos changes fuente:

```yaml
**Source change**: `auth-foundation`, `auth-foundation-slice-c`
**Status**: active · **Created**: 2026-06-10 · **Last sync**: 2026-06-14 (Slice C)
```

(Ambos mirrors, EN y ES, actualizados.)

El campo `Status` se mueve de `draft` a `active` porque los 16 deltas ya están en el spec; el spec es la fuente de verdad, no un borrador. Un cambio futuro que agregue nuevos deltas bumpearía a `Last sync: YYYY-MM-DD (<change-name>)`.

---

## 5. Commits

El sync es el **segundo de 3 commits atómicos** en este cierre de lifecycle:

| #   | SHA       | Tipo            | Descripción                                                                    |
| --- | --------- | --------------- | ------------------------------------------------------------------------------ |
| 1   | `0c5b339` | docs(openspec)  | add auth-foundation-slice-c verify report (el commit de verify)                |
| 2   | `974390b` | docs(openspec)  | sync auth-foundation-slice-c deltas to canonical auth spec (el commit de sync) |
| 3   | `d64b61a` | chore(openspec) | archive auth-foundation and auth-foundation-slice-c (el commit de archive)     |

Los 3 SHAs son los reales, confirmados por `git log origin/develop -3 --format='%H %s'`. El reporte se commiteó con el commit 2; los SHAs 1, 2, 3 se confirman con `git log` post-commit.

---

## 6. Re-verificación post-sync

Post-sync, el spec canónico satisface los 11 deltas promovidos:

| Delta      | Sección del spec                                        | Verificado por                                                           |
| ---------- | ------------------------------------------------------- | ------------------------------------------------------------------------ |
| DELTA-C1.1 | `Cross-module contracts > Test configuration`           | `grep -c "Test configuration" openspec/specs/auth/spec.md` → 1           |
| DELTA-C2.1 | `Endpoints > Application-owned (Hono, under /api/*)`    | `grep -c "Catch-all routing precedence" openspec/specs/auth/spec.md` → 1 |
| DELTA-C2.2 | `Cross-module contracts > Module index and public API`  | `grep -c "^  - \`honoApp\`" openspec/specs/auth/spec.md` → 1             |
| DELTA-C2.3 | `Cross-module contracts > App Router middleware`        | `grep -c "App Router middleware" openspec/specs/auth/spec.md` → 1        |
| DELTA-C2.4 | `Security guarantees > Security test coverage` (fila 1) | `grep -c "login.timing.test.ts" openspec/specs/auth/spec.md` → 1         |
| DELTA-C2.5 | `Security guarantees > Security test coverage` (fila 2) | `grep -c "oauth.state-csrf.test.ts" openspec/specs/auth/spec.md` → 1     |
| DELTA-C2.6 | `Security guarantees > Security test coverage` (fila 3) | `grep -c "secrets.in-logs.test.ts" openspec/specs/auth/spec.md` → 1      |
| DELTA-C2.7 | `Security guarantees > Security test coverage` (fila 4) | `grep -c "origin-check.test.ts" openspec/specs/auth/spec.md` → 1         |
| DELTA-C2.8 | `Security guarantees > Security test coverage` (fila 5) | `grep -c "argon2.parameters.test.ts" openspec/specs/auth/spec.md` → 1    |
| DELTA-C2.9 | `Security guarantees > Security test coverage` (fila 6) | `grep -c "cookie.attributes.test.ts" openspec/specs/auth/spec.md` → 1    |
| DELTA-C3.1 | `Cross-module contracts > Continuous integration`       | `grep -c "Continuous integration" openspec/specs/auth/spec.md` → 1       |
| DELTA-C3.2 | `Cross-module contracts > Repository governance`        | `grep -c "Repository governance" openspec/specs/auth/spec.md` → 1        |

Los 5 deltas no promovidos están contemplados en la sección `References`:

```bash
$ grep -c "^## References" openspec/specs/auth/spec.md
1
$ grep -c "docs/adr/0001" openspec/specs/auth/spec.md
1
$ grep -c "Documents-es/README.md" openspec/specs/auth/spec.md
1
```

Los 16 deltas tienen un hogar en el spec canónico, sea como sección promovida o como referencia.

---

## 7. Flags abiertos heredados del verify report

El sync no resolvió ninguno de los 7 flags del verify report. Los flags están documentados en el verify report y quedan a criterio del usuario:

- **FLAG-V1 (WARNING)** — drift de conteo de tests `132/135` vs `137/137`. El spec sigue diciendo `137/137` (el criterio de aceptación se preserva como forecast del design). La puerta de CI es la respuesta autoritativa.
- **FLAG-V2 (WARNING)** — `next-auth@5.0.0-beta.31` declarado pero `5.0.0-beta.25` instalado. El `node_modules` en disco está stale; CI instala la versión correcta.
- **FLAG-V3 (NOTE)** — 3 tests re-incluidos son static checks. El sync ahora documenta esto en la "Test method note" del spec para que un lector futuro no se sorprenda.
- **FLAG-V4 (NOTE)** — el matcher del middleware excluye `/api/auth/*` pero no `/api/*`. **Resuelto por el sync** — la subsección `App Router middleware` ahora describe el comportamiento real del matcher.
- **FLAG-V5 (NOTE)** — el spec no mencionaba `runtime: 'nodejs'`. **Resuelto por el sync** — agregado a la sección `Application-owned` y a la subsección `App Router middleware`.
- **FLAG-V6 (NOTE)** — el escenario 4 de DELTA-C1.1 mezcla el fix de sólo-test con el bump de dependencia. No resuelto (el archivo delta del spec sigue diciendo "no production code change"; el usuario puede actualizar el archivo delta en un follow-up o aceptar la imprecisión).
- **FLAG-V7 (NOTE)** — trailer Co-authored-by. No es una violación; no es una concern del sync.

De los 7 flags, el sync resolvió 2 (FLAG-V4, FLAG-V5) y documentó 1 (FLAG-V3). Los 4 restantes (FLAG-V1, V2, V6, V7) no son concerns del sync y se quedan en el verify report para la review del usuario.

---

## 8. Dual write check

- [x] `openspec/specs/auth/spec.md` actualizado (canónico, inglés)
- [x] `Documents-es/openspec/specs/auth/spec.md` actualizado (mirror español, mismo commit)
- [x] `openspec/changes/auth-foundation-slice-c/sync-report.md` (este archivo)
- [x] `Documents-es/openspec/changes/auth-foundation-slice-c/sync-report.md` (mirror español, mismo commit)

---

## 9. Próximo paso

`sdd-archive` (commit 3 del cierre de lifecycle): mover
`openspec/changes/auth-foundation/` y
`openspec/changes/auth-foundation-slice-c/` (más sus
mirrors en español) a `openspec/changes/archive/`. Un único
commit atómico:
`chore(openspec): archive auth-foundation and auth-foundation-slice-c`.

Después de que el archive aterrice, el cierre de lifecycle está completo:

- 33 de 33 tareas del padre hechas
- 14 de 14 tareas de Slice C hechas
- 16 de 16 spec deltas promovidos
- Verify report + sync report + archive en 3 commits atómicos
- `auth-foundation` y `auth-foundation-slice-c` cerrados
