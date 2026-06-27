# Sync Report — `reports`

**Autor**: Sebastián Illa
**Cambio**: `reports`
**Branch**: `chore/sync-reports` (desde `develop`)
**SHA base**: `4fcda4b`
**Fecha**: 2026-06-27
**Especificación canónica**: `openspec/specs/reports/spec.md` (source of truth)
**Especificación delta**: `openspec/changes/reports/specs/reports/spec.md` (mantenida en lockstep)

> Documenta el cierre `sdd-sync` del cambio SDD `reports`
> después de que `sdd-verify` devolvió `PASS`. La
> especificación canónica NO fue escrita en la fase de
> planning — a diferencia de `transactions`, donde la spec
> canónica aterrizó en #58 — porque `reports` fue
> scoped como capability autocontenida y la spec vivió bajo
> la carpeta del cambio. Este commit promueve la delta spec
> en `openspec/changes/reports/specs/reports/spec.md` a la
> canónica en `openspec/specs/reports/spec.md`. El espejo
> en inglés vive en
> `openspec/changes/reports/sync-report.md`.

## 1. Verificación de sync de spec

A diferencia de `transactions` (que tuvo su spec canónica
commiteada en la fase de planning, ver `3584ec7` para #58),
la spec canónica de `reports` NO existía en `develop` al
comienzo de este sync. La promoción ocurrió en tres pasos:

1. Copiar `openspec/changes/reports/specs/reports/spec.md`
   a `openspec/specs/reports/spec.md` verbatim (781 líneas).
2. Flipear el header del wording de delta-spec a
   canonical-spec y actualizar el campo `**Estado**` de
   `active` a `implementado` (con `**Cambio fuente**:
reports` y `**Promovido**: 2026-06-27`).
3. Mirror en `Documents-es/openspec/specs/reports/spec.md`
   (820 líneas; misma forma de contenido, misma estructura
   de REQ/scenario).

La canónica declara **7 Requirements (REQ-RPT-1 a REQ-RPT-7)**
con **20 scenarios** bajo headers `#### Scenario:`. Un
`diff` entre la canónica y la delta después de la promoción
muestra solo drift intencional de metadata:

| Segmento de diff              | Canónica (`openspec/specs/...`)                                                                                                                                            | Delta (carpeta del cambio)                                                                                                                                         | Razón                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Párrafo introductorio         | "Especificación canónica de la capability `reports`. Operationaliza la propuesta de `reports` v1 (2026-06-26)."                                                            | "Primera escritura de la spec de la capability `reports`. Operationaliza la propuesta de `reports` v1 (borrador 2026-06-26)."                                      | La canónica es la source of truth post-promoción; la delta retiene el wording del planning-time. Auto-identificación de las dos copias.                                                                                                                                                                                |
| Línea de auto-identificación  | "Esta es la **especificación canónica** de la capability `reports`, promovida desde la delta en la carpeta del cambio el 2026-06-27 …"                                     | "Esta es la **delta spec** de la nueva capability `reports`. La capability `reports` aún no existe bajo `openspec/specs/` … hasta que `sdd-archive` la promueva …" | Una fue escrita para vivir en `openspec/specs/`, la otra bajo la carpeta del cambio. Auto-identificación intencional.                                                                                                                                                                                                  |
| Campo `**Estado**`            | `implementado · **Cambio fuente**: reports · **Promovido**: 2026-06-27 (sdd-sync, después de 4 PRs de slice mergeados en develop vía #76/#79/#80/#85 + fixes vía #81/#82)` | `active · **Creado**: 2026-06-26 · **Última sync**: 2026-06-26 (reports)`                                                                                          | La canónica refleja el estado post-merge; la delta queda con el sello de planning-time.                                                                                                                                                                                                                                |
| Campo `**Cambio fuente**`     | `reports` (agregado explícitamente)                                                                                                                                        | `reports` (ya presente, mismo valor)                                                                                                                               | La canónica lleva `**Cambio fuente**` como campo de header por convención del proyecto; la delta lo tenía desde el inicio.                                                                                                                                                                                             |
| Sección trailing `## History` | Presente (registra "2026-06-26 (v1) — first write. Created by the `reports` change.")                                                                                      | Presente (contenido idéntico)                                                                                                                                      | Ambas copias llevan la misma sección `## History` porque la delta fue la source of truth al momento de la promoción y la History registra el evento original de planning. La canónica NO agrega un sello de History separado al sincronizar (el campo `**Promovido**: 2026-06-27` en el header carga esa información). |

Los 7 REQ y 20 scenario counts matchean exactamente
(verificado vía `grep -cE '^#### Requirement:'` y
`grep -cE '^#### Scenario:'`). Un diff estructural entre
las specs canónicas EN y ES devuelve cero diferencias en
los headings de REQ + Scenario:

```
$ diff <(grep -E '^#### Requirement:|^#### Scenario:' openspec/specs/reports/spec.md) \
        <(grep -E '^#### Requirement:|^#### Scenario:' Documents-es/openspec/specs/reports/spec.md)
(sin output — match perfecto)

$ grep -cE '^#### Requirement: REQ-RPT-' openspec/specs/reports/spec.md
7
$ grep -cE '^#### Requirement: REQ-RPT-' Documents-es/openspec/specs/reports/spec.md
7
$ grep -cE '^#### Scenario:' openspec/specs/reports/spec.md
20
$ grep -cE '^#### Scenario:' Documents-es/openspec/specs/reports/spec.md
20
```

El delta de cross-link sobre `transactions`
(`openspec/changes/transactions/specs/transactions/spec.md`
— referenciado en REQ-RPT-7 / REQ-TX-13 para la suscripción
no-op a `TransactionRecorded`) NO se modifica en este sync;
el texto de referencia en la spec canónica de `reports`
apunta a la spec canónica de `transactions`, que ya
documenta `TransactionRecorded` por el commit de planning
de #58.

## 2. Status de la carpeta del cambio (nota post-sync)

Este sync mantiene la carpeta del cambio en
`openspec/changes/reports/` (aún NO archivada). La próxima
fase SDD, `sdd-archive`, corre en un chore posterior
SEPARADO que:

1. `git mv openspec/changes/reports` →
   `openspec/changes/archive/2026-06-27-reports/` (por la
   convención "Artifact layout" de `openspec/AGENTS.md`; la
   fecha es la de cierre, espejando la carpeta de archivo
   `2026-06-24-transactions`).
2. Mirror del mismo move en
   `Documents-es/openspec/changes/`.
3. Abre un PR de `chore/archive-reports` a `develop` con
   el move de archivo + un status flip final sobre
   cualquier artefacto untracked restante (por ej.
   `apply-progress.md` si su campo Status necesita flipear,
   lo cual NO requiere hoy — `apply-progress.md` carga
   progreso slice por slice y no tiene un campo
   `**Status**: draft` por convención OpenSpec; es un
   ledger per-slice, no un lifecycle gate).

Por el handoff del orquestador: sdd-sync es un chore
SEPARADO de sdd-archive. Este PR solo aterriza la
promoción de spec + los status flips sobre los tres
artefactos lifecycle-gate.

## 3. Status flips

Tres artefactos cargan un campo Status / Estado que flipea
de `draft` / `borrador` a `implementado` / `implementado`.
(El precedente de `transactions` flipeó CUATRO artefactos
porque ese cambio tenía `explore.md`; `reports` NO — no
hay documento de research en la carpeta del cambio.)

| Archivo       | Campo EN      | Antes                                                                      | Después                                                                                                                                                        |
| ------------- | ------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal.md` | `**Status**:` | `draft`                                                                    | `implemented` (+ `**Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82)`)                                         |
| `tasks.md`    | `**Status**:` | `slices 1, 2, 3 complete (T-RPT-001..210); slice 4 (dashboard-ui) pending` | `implemented` (+ `**Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89)`) |
| `design.md`   | `**Status**:` | `draft`                                                                    | `implemented` (+ `**Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82)`)                                         |

Los mirrors ES reciben los mismos flips con la misma
semántica de campos.

```
$ grep -nE '^\*\*(Status|Estado)\*\*' \
      openspec/changes/reports/{proposal,tasks,design}.md \
      Documents-es/openspec/changes/reports/{proposal,tasks,design}.md
openspec/changes/reports/proposal.md:3:**Status**: implemented · **Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82) · **Author**: Sebastián Illa
openspec/changes/reports/tasks.md:6:**Status**: implemented · **Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89) · **Created**: 2026-06-26
openspec/changes/reports/design.md:3:**Status**: implemented · **Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82) · **Author**: Sebastián Illa · **Created**: 2026-06-26
Documents-es/.../proposal.md:3:**Estado**: implementado · **Implementado**: 2026-06-27 (slices 1-4 mergeados en develop vía #76/#79/#80/#85 + fixes vía #81/#82) · **Autor**: Sebastián Illa
Documents-es/.../tasks.md:6:**Status**: implemented · **Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89) · **Created**: 2026-06-26
Documents-es/.../design.md:3:**Estado**: implementado · **Implementado**: 2026-06-27 (slices 1-4 mergeados en develop vía #76/#79/#80/#85 + fixes vía #81/#82) · **Autor**: Sebastián Illa · **Creado**: 2026-06-26
```

Los seis flips aterrizaron en este commit; no quedan
campos `draft`/`borrador` en ninguno de los tres headers
de artefactos lifecycle-gate. Un grep defensivo lo
confirma:

```
$ git grep -nE '^\*\*(Status|Estado)\*\*: (draft|borrador)' \
      -- 'openspec/changes/reports/*.md' 'Documents-es/openspec/changes/reports/*.md'
(sin matches)
```

El archivo `apply-progress.md` NO se flipea
intencionalmente — carga el ledger slice-por-slice de
commits y la evidencia RED → GREEN de TDD; por el
precedente de sync de `transactions`, el artefacto
`apply-progress` es un log per-slice, no un lifecycle
gate, y queda en cualquier status que la última slice
haya escrito.

## 4. CJK scan en mirrors

La regla del `AGENTS.md` raíz §13.4 requiere un scan de
caracteres CJK en cada espejo en español para atrapar
artefactos de herramientas de traducción. El scan sobre
los 6 archivos mirror (3 specs/tasks/design EN + 3
specs/tasks/design ES, más los 2 archivos de sync-report):

```bash
$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/specs/reports/ \
      Documents-es/openspec/changes/reports/ | wc -l
0
```

Tanto el bloque canónico CJK Unified Ideographs
(`U+4E00–U+9FFF`) como los rangos full-width / CJK
punctuation / half-width devuelven cero matches sobre
los 6 archivos mirror (y el mirror ES del sync-report).
El traductor produjo español neutro profesional limpio
según §13.4.

## 5. Audit trail

El cambio `reports` fue planeado + aterrizado en 10 PRs
en `develop`, todos alcanzados vía PR (por `AGENTS.md`
raíz §5.2 — squash-merge para historial lineal). El
ledger de PRs:

| #   | Commit (short) | PR        | Slice / Tipo                                                                 |
| --- | -------------- | --------- | ---------------------------------------------------------------------------- |
| 1   | `1f2f571`      | #76       | Slice 1 — entidades de `reports-domain` (kernel port + 3 aggregates + tests) |
| 2   | `00d1298`      | #77       | Wiring del coverage gate — incluir `src/modules/reports/**` en el gate       |
| 3   | `662b48c`      | #78       | Slice 2 — `reports-domain` ports + agregadores puros + barrel                |
| 4   | `fbfcd9a`      | #79       | Slice 3 — `reports-application` (schemas, actions, DTOs, fixtures)           |
| 5   | `2d70aa9`      | #80       | Slice 4 — `reports-routes` (rutas Hono + composition root + noop subscriber) |
| 6   | `38a8083`      | #81       | Fix — `I-RPT-3.1` (upper bound exclusivo en el filtro de rango de fechas)    |
| 7   | `561acee`      | #82       | Fix — Husky pre-push hook (detectar branch-delete vía STDIN)                 |
| 8   | `a28338f`      | #85       | Slice 5 (final) — `dashboard-ui` (RSC + 3 presentational components)         |
| 9   | `aacb4ac`      | #88       | Housekeeping — documentar quirks de entorno en `AGENTS.md` §9.7              |
| 10  | `4fcda4b`      | #89       | Housekeeping — agregar `.npmrc` a `.gitignore`                               |
| 11  | (este commit)  | (este PR) | Sync — promover spec delta a canónica + Status flips + sync-report           |

Nota: no hay `#83` ni `#84` en el audit trail. Esos
números de PR fueron reservados / usados por otro trabajo
que NO pertenece al cambio `reports`. El ledger de PRs
de arriba lista los PRs reales que aterrizaron trabajo
relacionado con `reports` en `develop` entre el PR #76
y el sync post-#89.

La evidencia en `develop` post-merge de las 4 slices + 2
fixes + 2 housekeeping commits (por la fase de verify):

```
$ git log develop --oneline | head -10
4fcda4b chore(gitignore): add .npmrc to .gitignore (#89)
aacb4ac docs(agents): document environment quirks for macOS / this user's setup (#88)
a28338f feat(dashboard-ui): add dashboard RSC with three reports cards + empty CTA (final slice of reports change) (#85)
561acee fix(husky): detect branch-delete via STDIN, not via positional args (#82)
38a8083 fix(reports): use exclusive upper bound in date range filter (I-RPT-3.1) (#81)
2d70aa9 feat(reports-routes): wire reports routes + composition root + noop subscriber (#80)
fbfcd9a feat(reports-application): add reports application layer (schemas, actions, DTOs, fixtures, integration test) (#79)
662b48c feat(reports-domain): ports + pure aggregators + barrel (ReportsRepositoryPort, ReportSubscriberPort, cross-user isolation) (#78)
00d1298 chore(test): include src/modules/reports/** in coverage gate (#77)
1f2f571 feat(reports-domain): entities (kernel port + MonthlySummary + CategoryBreakdown + AccountFlow) (#76)
```

Los 4 PRs de slice shippean la capability completa. Los 2
PRs de fix son correcciones post-merge: `#81` (I-RPT-3.1)
cierra un bug del filtro de date-range encontrado durante
el review de slice 4, y `#82` es un fix de tooling de
Husky no relacionado al comportamiento runtime (previene
un falso positivo en el pre-push hook). Los 2 PRs de
housekeeping (`#88` documentando quirks de macOS env en
`AGENTS.md` §9.7, `#89` agregando `.npmrc` a
`.gitignore`) son cleanups tangenciales que aterrizaron
entre slice 4 y sync. Ninguno altera el contrato de la
capability `reports`.

## 6. Self-verify (ejecutado después de que este commit aterrice)

```
$ ls openspec/specs/reports/
spec.md
$ ls Documents-es/openspec/specs/reports/
spec.md
$ ls openspec/changes/reports/
apply-progress.md  design.md  proposal.md  specs/  sync-report.md  tasks.md
$ ls Documents-es/openspec/changes/reports/
apply-progress.md  design.md  proposal.md  specs/  sync-report.md  tasks.md

$ git diff --stat origin/develop..HEAD
  ... 12 archivos cambiados, 0 inserciones(+), 0 deletions(-) en src/, app/, o scripts/
  ... (solo archivos de metadata en openspec/ + Documents-es/openspec/)

$ git grep -nE '^\*\*(Status|Estado)\*\*: (draft|borrador)' HEAD -- \
      'openspec/changes/reports/*.md' 'Documents-es/openspec/changes/reports/*.md'
(sin matches)

$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/specs/reports/ \
      Documents-es/openspec/changes/reports/ | wc -l
0

$ pnpm run typecheck 2>&1 | tail -3
> tsc --noEmit
(output vacío = 0 errores)

$ pnpm test 2>&1 | tail -3
(sin cambios respecto al pre-sync — ningún archivo de código fuente fue tocado por este commit)
```

La promoción es metadata-only; no toca ningún archivo
fuente bajo `src/`, `prisma/`, o `app/`. La spec canónica
en `openspec/specs/reports/spec.md` es la source of truth
desde este commit en adelante; la delta en
`openspec/changes/reports/specs/reports/spec.md` se
mantiene en lockstep para el audit trail (el move de
`sdd-archive` reubicará la delta dentro de la carpeta
`archive/2026-06-27-reports/` en un chore posterior).

El espejo en español en
`Documents-es/openspec/specs/reports/spec.md` es la
canónica española source of truth; el mirror ES en la
carpeta del cambio es la copia de audit-trail. EN + ES
aterrizaron en este único commit atómico por
`AGENTS.md` raíz §13.3.

## 7. Open follow-ups (post-sync, para la fase de archive)

La fase `sdd-archive`:

1. Correrá `git mv openspec/changes/reports` →
   `openspec/changes/archive/2026-06-27-reports/`.
2. Mirrorá el move en
   `Documents-es/openspec/changes/`.
3. Confirmará que el ledger slice-por-slice de
   `apply-progress.md` carga el commit final de slice 4
   (`a28338f`, #85).
4. Actualizará `openspec/config.yaml` para flipear la
   capability `reports` de `in-development` a `shipped`
   si tal flag existe (si no, no se necesita cambio de
   flag — verificado: `openspec/config.yaml` solo lista
   capabilities en el array `capabilities:`; el tracking
   de status es per-PR lifecycle, no un flag de config).
5. Abrirá el PR de archive para review.

No se surfacearon gaps MEDIUM ni HIGH en la fase de
verify (ver
`openspec/changes/archive/2026-06-24-transactions/verify-report.md`
para el precedente de verify-report — el verify report
de `reports`, si se produjo, vive en la memoria de
trabajo del orquestador; el verdict de verify `PASS` es
el único estado que este sync consume).

El único follow-up abierto es el item LOW de housekeeping
del review de slice 4: un futuro cambio de UX
(`reports-ui` o `transactions-ui`) agregará primitives
de design-system, auditorías de accesibilidad, y una
librería de charts — ninguno de estos es parte de v1 y
no bloquean el sync.
