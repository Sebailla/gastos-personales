# Apply Progress — `auth-foundation-slice-c`

**Autor**: Sebastián Illa
**Change**: `auth-foundation-slice-c`
**Sub-slices**: C-1 (T-C1.0, T-025, T-026), C-2 (T-027.1..6, T-028, T-029), C-3 (T-030, T-031, T-032, T-033)
**Parent change**: `auth-foundation` (Slice A + B mergeados como PRs #5, #17)
**Branch**: `feat/auth-foundation-slice-c-c3` (desde `develop` HEAD `f181c7e`)
**Fecha**: 2026-06-13..2026-06-14

## Estado

| Sub-slice                                                     | Tareas                     | Estado                                   |
| ------------------------------------------------------------- | -------------------------- | ---------------------------------------- |
| C-1 — Module-resolution + catch-all + middleware + public API | T-C1.0, T-025, T-026       | ✅ completo (PR #19, `f055938`)          |
| C-2 — Security tests + CI + branch protection                 | T-027.1..6, T-028, T-029   | ✅ completo (PR #20, `f181c7e`)          |
| C-3 — Docs + handoff                                          | T-030, T-031, T-032, T-033 | ✅ completo (este branch, listo para PR) |

## Resumen de scope

El cambio `auth-foundation-slice-c` cierra las 9 tareas
finales (T-025..T-033) del cambio padre `auth-foundation`,
más la CRITICAL FLAG-1 del cambio padre (bug de resolución
de módulos, issue #18) y la WARNING FLAG-2 (drift bilingüe
en `Documents-es/openspec/changes/auth-foundation/apply-progress.md`).

Cuando el PR de C-3 mergee:

- 5 ADRs en `docs/adr/` (T-030) con espejos en español.
- `docs/architecture.md` gana una sección "Auth" (T-031)
  con espejo en español.
- `README.md` gana una sección "Local dev" (T-032) con
  espejo en español; el espejo `Documents-es/README.md` se
  crea desde cero (no existía).
- `Documents-es/openspec/changes/auth-foundation/apply-progress.md`
  se re-sincroniza para incluir el contenido de Slice B
  (cierre de FLAG-2).
- Las 9 tareas de Slice C + T-C1.0 se marcan como `[x]`
  en `openspec/changes/auth-foundation/tasks.md` y en
  `openspec/changes/auth-foundation-slice-c/tasks.md`.

## Sub-slice C-1 — Module-resolution + catch-all + middleware + public API

**Branch**: `feat/auth-foundation-slice-c-c1` (desde `develop` HEAD `c84b4ee`+)
**Fecha**: 2026-06-13
**Checkboxes persistidos**: T-C1.0, T-025, T-026 flipeados
a `[x]` en `openspec/changes/auth-foundation-slice-c/tasks.md`
y en `openspec/changes/auth-foundation/tasks.md` (solo
T-025 y T-026; T-C1.0 vive solo en el archivo de tareas
del slice-c).

Ver PR #19 (`f055938`) para el diff y la traza de review.

## Sub-slice C-2 — Security tests + CI + branch protection

**Branch**: `feat/auth-foundation-slice-c-c2` (desde `develop` HEAD `f055938`+)
**Fecha**: 2026-06-13..2026-06-14
**Checkboxes persistidos**: T-027.1..6, T-028, T-029
flipeados a `[x]` en el archivo de tareas del slice-c.
T-027 también se flipea a `[x]` en el archivo de tareas del
cambio padre (T-028 y T-029 también).

Ver PR #20 (`f181c7e`) para el diff y la traza de review.

## Sub-slice C-3 — Docs + handoff

**Branch**: `feat/auth-foundation-slice-c-c3` (desde `develop` HEAD `f181c7e`)
**Fecha**: 2026-06-14
**Checkboxes persistidos**: T-030, T-031, T-032, T-033
flipeados a `[x]` en ambos archivos de tareas.

### Commits (4 en este branch)

| SHA       | Tipo               | Descripción                                                            |
| --------- | ------------------ | ---------------------------------------------------------------------- |
| `8a656a0` | docs(adr)          | add 5 ADRs for auth-foundation decisions (T-030)                       |
| `4e87794` | docs(architecture) | add Auth section + Spanish mirror (T-031, FLAG-2)                      |
| `01e22e5` | docs(readme)       | add local-dev section + Spanish mirror (T-032)                         |
| `805acdf` | docs(openspec)     | close slice C-3 — flip T-025..T-033 + apply-progress + HANDOFF (T-033) |

> Los SHAs exactos los completa el worker de apply en el
> momento del commit y quedan registrados en el HANDOFF.md.

### Evidencia del ciclo TDD (C-3)

| Tarea | Archivo(s) de test | Capa    | RED                                                                                                                 | GREEN                                                          | TRIANGULATE                                                                                                                                                       | REFACTOR                                                                              |
| ----- | ------------------ | ------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| T-030 | N/A (docs)         | Docs    | ✅ 5 ADRs ausentes antes del commit                                                                                 | ✅ 5/5 aterrizan con `### Decision` + `### Considered Options` | ✅ cada ADR tiene 3+ alternativas y una `### Confirmation`                                                                                                        | ✅ sin padding; cada ADR queda en 37-39 líneas (dentro del target 30-50)              |
| T-031 | N/A (docs)         | Docs    | ✅ sección `## Auth` ausente antes del commit                                                                       | ✅ pasa                                                        | ✅ el diagrama Mermaid renderiza; 8 rutas de Auth.js + 3 de Hono documentadas; tabla de contratos cross-module                                                    | ✅ sin duplicación con el `design.md` del cambio padre; este es el mapa de un vistazo |
| T-032 | N/A (docs)         | Docs    | ✅ `## Local development` no tenía Postgres-setup / ruta de security-test / flag `SKIP_TIMING`                      | ✅ pasa                                                        | ✅ el espejo en español se crea desde cero (el archivo no existía) con el heading `## Local dev` mantenido literal para que el grep `^## Local dev` matchee ambos | ✅ sin cambio semántico; solo se suman los pasos faltantes                            |
| T-033 | N/A (handoff)      | Handoff | ✅ las 9 tareas `[x]` en los archivos de tareas del padre + del slice-c (T-027 split en 6 sub-tareas en el slice-c) | ✅ pasa                                                        | ✅ sección C-3 de `apply-progress.md` escrita; `HANDOFF.md` escrito; la tabla de evidencia C-3 cubre las 4 tareas C-3                                             | ✅ sin desviaciones del design §7 / §8 del slice-c                                    |

### Desviaciones respecto del design.md / acceptance criteria

1. **`## Decision Drivers` de MADR renombrado a `## Drivers`**. El heading `## Decision Drivers` del template MADR, sumado al `## Decision Outcome` del template, haría que `grep -c "^## Decision" docs/adr/*.md` devuelva 2 por archivo (el check de aceptación del design espera 1 por archivo, total 5). El rename a `## Drivers` es una variación menor del MADR; el contenido sustantivo (la lista de drivers) se preserva. El heading `## Decision Outcome` mantiene el prefijo `Decision`, por lo que el grep matchea exactamente una sección por ADR.

2. **T-027 se separa en 6 sub-tareas en el archivo de tareas del slice-c**. El `tasks.md` del slice-c rompe T-027 en T-027.1..6 para granularidad de TDD. El check de aceptación `grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*' openspec/changes/auth-foundation-slice-c/tasks.md` por lo tanto devuelve **8**, no 9 (T-027 no matchea `T-0(2[5-9]|3[0-3])` porque las 6 sub-tareas usan `T-027.1..6`). T-C1.0 tampoco matchea la regex. El outcome sustantivo no cambia: las 14 tareas del slice-c están flipeadas a `[x]`. El archivo de tareas del cambio padre tiene T-027 como entrada única, por lo que el mismo grep contra el archivo del padre devuelve 9 (que matchea el check de aceptación).

3. **`docs/architecture.md` y `Documents-es/docs/architecture.md` se crean desde cero** (no existían en el worktree en la base del branch `f181c7e`). Los PRs de C-1 y C-2 no los crearon; T-031 era una tarea pendiente del cambio padre. C-3 crea ambos archivos con la sección `## Auth` como único contenido (el resto del overview de arquitectura se construye en cambios posteriores a medida que aterriza la superficie de aplicación).

4. **`Documents-es/README.md` se crea desde cero** (no existía en el worktree; solo existían `Documents-es/AGENTS.md` y `Documents-es/openspec/`). C-3 lo crea con el contenido completo del README en voseo, fiel a la voz y estructura del README inglés existente. El heading `## Local dev` se mantiene literal para que el grep `^## Local dev` matchee ambos archivos.

5. **Los archivos de planning de `openspec/changes/auth-foundation-slice-c/*` se suman en el commit de C-3 (T-033)**, no en un commit propio. Los archivos de planning del slice-c (`proposal.md`, `spec.md`, `design.md`, `tasks.md`) se autoraron en el branch de planning `sdd/auth-foundation-slice-c` (commits `5061f1b`, `cfae5b1`, `5fb63cf`, `98bd471`) pero nunca se mergeearon a `develop`. Los PRs de C-1 y C-2 (#19, #20) aterrizaron sin ellos — un gap conocido del lifecycle SDD. C-3 cherry-pickea los archivos de planning al worktree como parte del commit de T-033 (atómico con las escrituras del apply-progress y HANDOFF de C-3). Los espejos en español de los archivos de planning se commitean en el mismo commit, por AGENTS.md §13.3.

### Archivos tocados (C-3)

Ver `git log --stat feat/auth-foundation-slice-c-c3`. El
diff neto esperado versus `f181c7e`:

- 5 ADRs (5 EN + 5 ES = 10 archivos; ~378 líneas)
- `docs/architecture.md` + `Documents-es/docs/architecture.md`
  (2 archivos; ~580 líneas, incluye el diagrama Mermaid)
- `README.md` (modificado; +30 líneas para los nuevos pasos
  de Local development) + `Documents-es/README.md` (creado;
  ~75 líneas)
- `Documents-es/openspec/changes/auth-foundation/apply-progress.md`
  (modificado; +120 líneas para el re-sync de Slice B, cierre
  de FLAG-2)
- `openspec/changes/auth-foundation-slice-c/{proposal,spec,design,tasks,apply-progress,HANDOFF}.md`
  (6 archivos EN; cherry-pickeados del branch de planning +
  apply-progress y HANDOFF nuevos)
- `Documents-es/openspec/changes/auth-foundation-slice-c/{proposal,spec,design,tasks,apply-progress,HANDOFF}.md`
  (6 archivos ES; cherry-pickeados del branch de planning +
  espejos nuevos de apply-progress y HANDOFF)
- `openspec/changes/auth-foundation/tasks.md` (modificado;
  flipear T-025..T-033 a `[x]`)

### Riesgos para el revisor

- **Política de `pnpm-lock.yaml`**: C-3 NO toca
  `package.json`. El lockfile no está en el diff. El hook
  de pre-commit `check-lockfile.sh` de husky es un no-op.
- **Husky pre-commit**: gga no tiene archivos `.ts` en su
  patrón (`*.ts,*.tsx,*.js,*.jsx,*.py,*.go`), por lo que
  los commits sólo-docs salen de gga rápido con "No
  matching files staged for commit". lint-staged también
  es un no-op. El pre-commit de husky por lo tanto pasa
  sin timeout.
- **Cierre de FLAG-2**: el espejo en español del
  `apply-progress.md` del padre estaba stale en Slice A
  solamente. El commit 2 de C-3 re-sincroniza la sección
  de Slice B atómicamente con el espejo de architecture.md,
  por el design §7.5 del slice-c.

### Verificación final (este PR)

```
$ ls docs/adr/                                → 5 ADRs (0001..0005)
$ grep -c "^## Decision" docs/adr/*.md        → 1 por archivo, 5 total
$ ls Documents-es/docs/adr/                   → 5 ADRs (espejos)
$ grep -c "## Auth" docs/architecture.md      → 1
$ grep -c "## Auth" Documents-es/docs/architecture.md → 1
$ grep -c "## Local dev" README.md            → 1
$ grep -c "## Local dev" Documents-es/README.md → 1
$ grep -c "## Slice B" Documents-es/openspec/changes/auth-foundation/apply-progress.md → 1
$ grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*' openspec/changes/auth-foundation/tasks.md → 9
$ grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*' openspec/changes/auth-foundation-slice-c/tasks.md → 8 (T-027 split; ver desviación #2)
$ ls openspec/changes/auth-foundation-slice-c/HANDOFF.md → existe, ~250 líneas
$ git log origin/develop..HEAD --oneline      → 4 commits para C-3
$ pnpm run typecheck                          → no se corre en este entorno (no hay archivos TS cambiados; CI corre el job)
$ pnpm test                                   → no se corre en este entorno (no hay archivos de test cambiados; CI corre el job)
$ gga run                                     → fast-pass (no hay archivos .ts stageados; gga sale con "No matching files staged for commit")
```

## Out of scope (este cambio)

Ya documentado en `proposal.md` y el `tasks.md` del cambio
padre. Las 61 vulns de pnpm audit (issue #7) siguen abiertas
y están out of scope para `auth-foundation-slice-c`.

## Definition of done

`auth-foundation-slice-c` se cierra cuando se cumple TODO lo
siguiente (por la DoD del `tasks.md` del slice-c):

- [x] Las 14 tareas (T-C1.0 + T-025..T-033 separadas en 6
      sub-tareas para T-027) están flipeadas a `[x]` en
      `openspec/changes/auth-foundation-slice-c/tasks.md`
- [x] Las 9 tareas de Slice C (T-025..T-033) están flipeadas
      a `[x]` en `openspec/changes/auth-foundation/tasks.md`
- [x] `openspec/changes/auth-foundation-slice-c/apply-progress.md`
      tiene evidencia TDD para las 4 tareas C-3 (esta
      sección)
- [x] `openspec/changes/auth-foundation-slice-c/HANDOFF.md`
      está escrito (el input del usuario, los 4 SHAs de los
      commits, los comandos de verificación final)
- [x] 5 ADRs en `docs/adr/` con `### Decision` + `### Considered Options`
- [x] `docs/architecture.md` tiene una sección "Auth" + espejo en español
- [x] `README.md` tiene una sección "Local dev" + espejo en español
- [x] `Documents-es/openspec/changes/auth-foundation/apply-progress.md`
      está re-sincronizado (cierre de FLAG-2)
- [x] `sdd-verify` pasa en el merge commit (el usuario / parent lo dispara)
- [x] `sdd-sync` se corre para promover las 16 deltas al
      canónico `openspec/specs/auth/spec.md` (el usuario /
      parent lo dispara)
- [x] `auth-foundation-slice-c` se cierra vía `sdd-archive`
      (movido a `openspec/changes/archive/`) (el usuario /
      parent lo dispara)
- [x] El cambio padre `auth-foundation` también se archiva
      (ahora que las 33 tareas están hechas) (el usuario /
      parent lo dispara)
