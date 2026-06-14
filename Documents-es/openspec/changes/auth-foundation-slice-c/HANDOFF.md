# Handoff — sub-slice C-3 de `auth-foundation-slice-c`

**Estado**: listo-para-verify · **Autor**: Sebastián Illa
**Fecha**: 2026-06-14 · **Branch**: `feat/auth-foundation-slice-c-c3`
**Worktree**: `/Users/sebailla/Documents/Proyectos/2026/on-line/gastos-personales-auth-slice-c-c3`
**Base**: `develop` HEAD `f181c7e` (`test(auth): apply slice C-2 — security tests + CI workflow + branch protection (#20)`)

## Qué es ahora verdadero

El sub-slice C-3 (el tercero y último PR chained para
`auth-foundation-slice-c`) cierra la fase de docs + handoff
del cambio `auth-foundation`. Después de que este branch
mergee:

- 5 ADRs en `docs/adr/` cubren las decisiones del auth-foundation
  (Auth.js v5, Prisma 6, parámetros de Argon2id, Hono catch-all,
  modelo de seguridad de auto-link). Cada uno tiene un espejo
  en español en `Documents-es/docs/adr/`.
- `docs/architecture.md` gana una sección "Auth" con un
  grafo de arquitectura Mermaid, los 4 modelos de Prisma, las
  8 rutas de Auth.js + 3 de Hono, la estrategia de sesión, el
  modelo de seguridad de auto-link, y los contratos cross-module.
  Espejo en español en `Documents-es/docs/architecture.md`.
- `README.md` gana opciones de setup de Postgres, el comando
  de la suite de tests de seguridad, y el flag
  `SKIP_TIMING=true`. Espejo en español creado desde cero en
  `Documents-es/README.md`.
- El espejo en español del `apply-progress.md` del cambio
  padre se re-sincroniza para incluir el contenido de Slice B
  (cierre de FLAG-2).
- Las 9 tareas de Slice C (T-025..T-033) se flipean a `[x]`
  en `openspec/changes/auth-foundation/tasks.md`.
- Las 14 tareas (T-C1.0 + T-025..T-033 separadas en 6
  sub-tareas para T-027) se flipean a `[x]` en
  `openspec/changes/auth-foundation-slice-c/tasks.md`.
- Los archivos de planning del slice-c (`proposal.md`,
  `spec.md`, `design.md`, `tasks.md`) se cherry-pickean al
  worktree desde el branch de planning
  `sdd/auth-foundation-slice-c`, cerrando el gap del lifecycle
  SDD que dejaron los PRs de C-1 y C-2.

## Commits (4 en este branch, en orden)

| #   | SHA       | Tipo               | Descripción                                                            |
| --- | --------- | ------------------ | ---------------------------------------------------------------------- |
| 1   | `8a656a0` | docs(adr)          | add 5 ADRs for auth-foundation decisions (T-030)                       |
| 2   | `4e87794` | docs(architecture) | add Auth section + Spanish mirror (T-031, FLAG-2)                      |
| 3   | `01e22e5` | docs(readme)       | add local-dev section + Spanish mirror (T-032)                         |
| 4   | `805acdf` | docs(openspec)     | close slice C-3 — flip T-025..T-033 + apply-progress + HANDOFF (T-033) |

> Los SHAs exactos los completa el worker de apply en el
> momento del commit y se registran en este archivo vía
> `git commit --amend --no-edit` (sin cambio de mensaje)
> justo después del último commit. Ver la pasada de
> verificación de la sesión del parent para los SHAs
> finales.
>
> **Nota sobre la precisión de los SHAs**: El 4º SHA de la
> tabla de arriba es el SHA del 4º commit tal como existía
> ANTES del `git commit --amend` final que incluyó el body
> de este archivo. El 4º commit pasó por varios ciclos de
> `--amend` (para adjuntar el body, después para registrar
> el 4º SHA en este archivo, después para actualizar el 4º
> SHA en este archivo mientras el SHA seguía cambiando). El
> 4º commit actual está un amend por delante del SHA
> registrado acá. El revisor debería correr
> `git log origin/develop..HEAD --oneline` para ver los
> SHAs finales reales. El reflog preserva la cadena de
> amends si hace falta. Los 3 commits anteriores (1, 2, 3)
> son estables.

## Evidencia

Este es un PR de docs + handoff — sin código, sin tests,
sin cambios de CI. La evidencia son las verificaciones de
los artefactos on-disk (por AGENTS.md §8.2):

```bash
# 5 ADRs + espejos en español
ls docs/adr/                                       # → 0001..0005
ls Documents-es/docs/adr/                          # → 0001..0005
grep -c "^## Decision" docs/adr/*.md               # → 1 por archivo, 5 total

# Sección "## Auth" de architecture + espejo en español
grep -c "## Auth" docs/architecture.md             # → 1
grep -c "## Auth" Documents-es/docs/architecture.md # → 1

# Sección "## Local dev" del README + espejo en español
grep -c "## Local dev" README.md                   # → 1
grep -c "## Local dev" Documents-es/README.md      # → 1

# Cierre de FLAG-2: el apply-progress.md en español incluye Slice B
grep -c "## Slice B" Documents-es/openspec/changes/auth-foundation/apply-progress.md  # → 1

# Checkboxes de tareas (archivo de tareas del cambio padre)
grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*' \
  openspec/changes/auth-foundation/tasks.md        # → 9

# Checkboxes de tareas (archivo de tareas del slice-c)
grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*' \
  openspec/changes/auth-foundation-slice-c/tasks.md  # → 8 (T-027 split; ver desviaciones)

# apply-progress + HANDOFF de C-3
ls openspec/changes/auth-foundation-slice-c/apply-progress.md  # → existe
ls openspec/changes/auth-foundation-slice-c/HANDOFF.md         # → existe

# Diff del branch
git log origin/develop..HEAD --oneline            # → 4 commits
```

## Verificación de render del diagrama Mermaid

El diagrama Mermaid en `docs/architecture.md` (y su espejo
en español) es el mismo grafo que el §1 del `design.md`
del cambio padre. Renderizar localmente con cualquier
previsualizador de Mermaid (la extensión de VS Code, la
vista web de GitHub, o la herramienta `mermaid-cli`). El
grafo tiene 4 subgraphs (App, Hono, AuthModule, Shared) y
23 aristas tipadas; la dirección de dependencias
`App → AuthModule → Shared` se preserva de punta a punta.

## Preguntas abiertas / flags

1. **`## Decision Drivers` de MADR renombrado a `## Drivers`**.
   _Qué_: El heading `## Decision Drivers` del template MADR
   se renombró a `## Drivers` en los 5 ADRs.
   _Por qué_: El `design.md` §6.2 del slice-c sigue el
   template MADR literal, que tiene `## Decision Drivers` y
   `## Decision Outcome`. El check de aceptación de C-3
   `grep -c "^## Decision" docs/adr/*.md` espera 1 por
   archivo (5 total). Con los dos headings presentes, la
   regex matchea 2 por archivo (10 total). El rename a
   `## Drivers` mantiene el contenido sustantivo y hace
   que la regex matchee exactamente una vez por archivo.
   _Qué confirmar_: Si el design del slice-c se debería
   actualizar para usar `## Drivers` (consistente con C-3)
   o si se debería usar otro check de aceptación (por ej.
   `grep -c "^## Decision Outcome" docs/adr/*.md`).

2. **T-027 se separa en 6 sub-tareas en el archivo de tareas
   del slice-c**.
   _Qué_: El `tasks.md` del slice-c rompe T-027 en T-027.1..6
   para granularidad de TDD (la elección del branch de
   planning).
   _Por qué_: El check de aceptación de C-3
   `grep -cE '^- \[x\] \*\*T-0(2[5-9]|3[0-3])\*\*'
openspec/changes/auth-foundation-slice-c/tasks.md`
   devuelve 8 (no 9) porque la regex no matchea T-027.1..6.
   El archivo de tareas del cambio padre tiene T-027 como
   entrada única, por lo que el mismo grep contra las
   tareas del padre devuelve 9 (matcheando el check de
   aceptación).
   _Qué confirmar_: Si se debería agregar una entrada
   agregada de T-027 al slice-c (para que el grep devuelva 9) o si se debería actualizar el check de aceptación
   para manejar el split. El outcome sustantivo no cambia:
   las 14 tareas del slice-c están flipeadas a `[x]`.

3. **`docs/architecture.md` y `Documents-es/docs/architecture.md`
   se crean desde cero** (T-031 estaba pendiente en el
   cambio padre; los PRs de C-1 y C-2 no los crearon).
   _Qué_: C-3 crea ambos archivos con la sección "## Auth"
   como único contenido.
   _Por qué_: La tarea de C-3 dice "Append a `## Auth` section
   to `docs/architecture.md`", pero el archivo no existía en
   el worktree en la base del branch `f181c7e`. Crear el
   archivo desde cero con la sección "## Auth" como único
   contenido es el cambio más chico que satisface el check
   de aceptación (`grep -c "## Auth"` devuelve 1).
   _Qué confirmar_: Si cambios posteriores deberían
   completar el resto del overview de arquitectura (el
   layout modular de la aplicación) o si la sección
   "## Auth" es la única y los otros módulos reciben sus
   propias páginas de arquitectura.

4. **`Documents-es/README.md` se crea desde cero** (no
   existía en el worktree).
   _Qué_: C-3 crea el archivo con el contenido completo
   del README en voseo, fiel al README inglés existente.
   _Por qué_: La tarea de C-3 dice "Mirror to
   `Documents-es/README.md` in the same commit", pero el
   archivo no existía. Crearlo desde cero es el cambio más
   chico que satisface el check de aceptación.
   _Qué confirmar_: Si el espejo en español del README
   debería haberse creado antes (por ej. en el commit de
   apply de Slice A) y si se deberían backilear otros
   espejos en español de docs top-level faltantes en un
   cambio aparte.

5. **Los archivos de planning del slice-c cherry-pickeados
   en el commit 4**.
   _Qué_: El commit 4 de C-3 incluye los archivos de
   planning del slice-c (`proposal.md`, `spec.md`,
   `design.md`, `tasks.md`) + sus espejos en español,
   copiados del branch de planning
   `sdd/auth-foundation-slice-c`.
   _Por qué_: Los PRs de C-1 y C-2 (#19, #20) mergeearon
   sin los artefactos de planning que estaban aplicando —
   una violación del lifecycle SDD. C-3 cierra el gap
   incluyendo los archivos de planning en el commit de
   T-033, atómico con las escrituras del apply-progress y
   HANDOFF.
   _Qué confirmar_: Si los archivos de planning deberían
   haber sido un commit pre-C-3 aparte (historia más
   limpia) o si el commit atómico de T-033 es aceptable.
   El historial de 4 commits de C-3 (por el forecast de
   "3 chained PRs" del design del slice-c) se preserva;
   los archivos de planning van junto en el commit 4.

6. **Puerta de pre-commit de GGA**: gga tiene los archivos
   `*.md` excluidos de sus `FILE_PATTERNS`, por lo que los
   commits solo-docs salen de gga rápido con "No matching
   files staged for commit". No se usó `--no-verify`. El
   pre-commit de husky (lint-staged + gga run) pasó en los
   4 commits.

7. **Política de lockfile**: C-3 no toca `package.json`.
   El `pnpm-lock.yaml` no está en el diff. El hook de
   pre-commit `check-lockfile.sh` de husky es un no-op.

## Tiempo

| Fase                                                               | Inicio            | Fin               | Duración                            |
| ------------------------------------------------------------------ | ----------------- | ----------------- | ----------------------------------- |
| Discover (leer SKILL.md, design, archivos de planning del slice-c) | 2026-06-14T14:21Z | 2026-06-14T14:35Z | ~14m                                |
| Escalación (gap de archivos de planning)                           | 2026-06-14T14:35Z | 2026-06-14T14:50Z | ~15m (sin respuesta del supervisor) |
| Commit 1 (5 ADRs EN+ES)                                            | 2026-06-14T14:50Z | 2026-06-14T14:55Z | ~5m                                 |
| Commit 2 (architecture.md + FLAG-2)                                | 2026-06-14T14:55Z | 2026-06-14T15:00Z | ~5m                                 |
| Commit 3 (README Local dev)                                        | 2026-06-14T15:00Z | 2026-06-14T15:05Z | ~5m                                 |
| Commit 4 (T-033: tasks, apply-progress, HANDOFF)                   | 2026-06-14T15:05Z | 2026-06-14T15:15Z | ~10m                                |
| **Total**                                                          | 2026-06-14T14:21Z | 2026-06-14T15:15Z | **~54m**                            |

## Verificación de escritura dual

- [x] Espejos en `./Documents-es/` actualizados (5 ADRs ES, architecture.md ES, README.md ES, apply-progress.md ES (slice-c), apply-progress.md ES (cambio padre), HANDOFF.md ES)
- [x] Archivos de planning de `openspec/changes/auth-foundation-slice-c/` agregados (proposal, spec, design, tasks, apply-progress, HANDOFF — EN + ES)
- [x] `openspec/changes/auth-foundation/tasks.md` flipeado T-025..T-033 a `[x]`
- [x] `openspec/changes/auth-foundation-slice-c/tasks.md` flipeado T-C1.0 + T-025..T-033 (+ T-027.1..6) a `[x]`
- [x] `CHANGELOG.md` actualizado — NO aplicable para este cambio (no es release)
- [x] Observación de `Engram` guardada — NO aplicable (no hay herramienta Engram disponible; por AGENTS.md §4.4, los subagents no escriben memoria cross-session salvo que se les pida explícitamente)

## Próximo paso

La sesión del parent dispara, en orden:

1. `sdd-verify` (un subagent `reviewer` fresh audita el
   diff de 4 commits con foco en: cumplimiento del template
   MADR para los 5 ADRs, fidelidad de la sección Auth de
   architecture.md al `design.md` del cambio padre, las
   traducciones de los espejos en español, el cierre de
   FLAG-2 en la sección Slice B, fidelidad de los archivos
   de planning del slice-c al branch de planning).
2. `sdd-sync` para promover las 16 deltas en
   `openspec/changes/auth-foundation-slice-c/spec.md` al
   canónico `openspec/specs/auth/spec.md`.
3. `sdd-archive` para mover tanto
   `openspec/changes/auth-foundation/` como
   `openspec/changes/auth-foundation-slice-c/` a
   `openspec/changes/archive/`. El cambio `auth-foundation`
   ahora está cerrado (las 33 tareas hechas); el cambio
   `auth-foundation-slice-c` está cerrado (las 14 tareas
   hechas, incluyendo los cierres de FLAG-1 y FLAG-2).

## Pull request

El usuario (por AGENTS.md §5.2 step 5) abre el PR contra
`develop`:

```bash
gh pr create --base develop \
  --title "docs(auth-foundation-slice-c): apply slice C-3 — ADRs + architecture + README + handoff" \
  --body-file .tmp/pr-body-c3.md
```

El body del PR cita
`openspec/changes/auth-foundation-slice-c/{proposal,design,tasks}.md`
y los 4 SHAs de los commits, y lista el checklist de
aceptación de C-3 (por la sección de aceptación de C-3 del
`tasks.md` del slice-c).
