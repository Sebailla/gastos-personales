# Reporte de Archivo — `transactions-ui`

**Autor**: Sebastián Illa
**Cambio**: `transactions-ui`
**Fase**: sdd-archive (hybrid: filesystem + Engram)
**Branch**: `chore/transactions-ui-archive` (desde `develop` post #104)
**Fecha**: 2026-06-29
**Modo**: hybrid
**Source of truth**: `openspec/specs/<capability>/spec.md` per `openspec/AGENTS.md`

---

## 1. Resumen del cambio

`transactions-ui` introdujo la **primera escritura de la capability
`ui`** del proyecto: un sistema de diseño de 23 primitives + un
layout shell de 5 primitives + los renders de Server Components de
grado de producción para `/accounts/*`, `/transactions/*`, y
`/dashboard`, más los query flags aditivos (`include=lastActivity`,
`include=accountName`) que conectan la UI con los Hono endpoints
existentes. También REEMPLAZÓ el requisito de smoke UI REQ-TX-15
en la capability `transactions` con un puntero delgado a la nueva
`ui/spec.md`. El cambio se entregó en **6 PRs de slice chained**
(#98 → #103) contra `develop` más un **PR de cleanup 4R (#104)**,
todos mergeados.

El cambio fue una entrega **force-chained, 400-line-budget** per
`openspec/config.yaml:21` (cache auto-forecast). Ningún slice
excedió el budget de review per-slice; el LoC acumulado estuvo
dentro del forecast del design (1,520–2,220 a través de 6 slices).

El slot de la capability `ui` estaba reservado en
`openspec/config.yaml:15` antes de que el cambio arrancara;
`sdd-archive` (esta fase) promueve la delta spec a canónica.

---

## 2. Spec sync (delta → canónica)

| Dominio        | Acción         | Detalles                                                                                                                         | Archivos                                                                                                                            |
| -------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ui`           | **CREADA**     | Primera escritura de la capability `ui`. 11 Requirements (REQ-UI-1 a REQ-UI-11) lifted verbatim desde la delta.                  | `openspec/specs/ui/spec.md` (canónica) · `openspec/changes/transactions-ui/specs/ui/spec.md` (delta, archivada)                     |
| `transactions` | **MODIFICADA** | REQ-TX-15 REEMPLAZADA con puntero delgado a `openspec/specs/ui/spec.md` REQ-UI-1..11. REQ-TX-1..14 sin cambios.                  | `openspec/specs/transactions/spec.md` (canónica) · `openspec/changes/transactions-ui/specs/transactions/spec.md` (delta, archivada) |
| `accounts`     | **SIN CAMBIO** | Dos query flags aditivos aterrizan en los GET endpoints existentes (sin deltas de spec; el cambio de comportamiento es aditivo). | n/a                                                                                                                                 |
| `reports`      | **SIN CAMBIO** | Los `?accountId=` + `?month=` del dashboard son UI state puro per REQ-UI-3.                                                      | n/a                                                                                                                                 |
| `auth`         | **SIN CAMBIO** | Cada página mantiene el `auth()` Server Component gate de `auth-foundation`.                                                     | n/a                                                                                                                                 |
| `fx`           | **SIN CAMBIO** | El path 503 de `FxRateProvider` queda igual; la UI de producción muestra su mensaje de error verbatim.                           | n/a                                                                                                                                 |
| `errors`       | **SIN CAMBIO** | El `ErrorEnvelope` de `src/shared/errors/app-error.ts` se reusa.                                                                 | n/a                                                                                                                                 |

### Verificación

```bash
# ui spec — delta vs canónica
diff openspec/changes/transactions-ui/specs/ui/spec.md openspec/specs/ui/spec.md
# → solo difieren el campo `Status:` del framing + la prosa
#   "esta es la delta / esta es la canónica".
#   11 Requirements, 0 mismatches de body, 0 headings faltantes.

# transactions spec — delta vs canónica
diff openspec/changes/transactions-ui/specs/transactions/spec.md openspec/specs/transactions/spec.md
# → solo difieren el campo `Status:` del framing + la tabla de
#   delta + el wording de REQ-TX-15 REPLACED.
#   El contenido del body de REQ-TX-1..14 es idéntico; el body
#   de REQ-TX-15 ahora apunta a ui/spec.md.
```

### Estado de REQ-TX-15 (canónica)

`openspec/specs/transactions/spec.md` contiene un heading
`### Requirement:` para REQ-TX-15 cuyo body es el **puntero
delgado** a `openspec/specs/ui/spec.md` REQ-UI-1 a REQ-UI-11. El
wording de smoke UI de la canónica pre-`transactions-ui` fue
REEMPLAZADO; los dos query flags aditivos (REQ-UI-1 + REQ-UI-2)
y la state machine de list-page (REQ-UI-3) son ahora owned por
la capability `ui`, no por la capability `transactions`.

---

## 3. Lista de PRs (6 slices + 1 cleanup, todos mergeados en `develop`)

| PR   | Título                                                                                                                                  | Slice                 | SHA (merge commit) | Mergeado en |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------ | ----------- |
| #98  | `feat(ui-primitives): tokens + 18 primitives + layout shell (slice 1 of 6 for transactions-ui)`                                         | 1 — `ui-primitives`   | `be85e9a`          | 2026-06-28  |
| #99  | `feat(ui-accounts): production renders for accounts pages (slice 2 of 6 for transactions-ui)`                                           | 2 — `accounts-ui`     | `46b58d2`          | 2026-06-28  |
| #100 | `feat(ui-transactions): production renders for transactions pages (slice 3 of 6 for transactions-ui)`                                   | 3 — `transactions-ui` | `43e72a1`          | 2026-06-28  |
| #101 | `feat(ui-dashboard-refactor): production renders for dashboard with account picker + month switcher (slice 4 of 6 for transactions-ui)` | 4 — `dashboard-ui`    | `9b4f7c0`          | 2026-06-28  |
| #102 | `test(ui-integration-tests): slice 5 axe-core a11y + visual snapshots + E2E happy paths`                                                | 5 — `integration`     | `b8c1d4e`          | 2026-06-28  |
| #103 | `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive (slice 6 of 6 for transactions-ui)`               | 6 — `docs-and-perf`   | `7ee9d71`          | 2026-06-29  |
| #104 | `fix(ui-4r-cleanup): top-5 4R review findings (as casts + Suspense + 'use client' + UUID + doc count)`                                  | cleanup (post-4R)     | `508b258`          | 2026-06-29  |

Los 7 PRs están mergeados en `develop` (head actual: `508b258`,
post #104). El worktree `chore/transactions-ui-archive` se creó
desde este head.

---

## 4. Task completion — 81/83 hechas, 2 user-owned (NO bloqueantes)

| Métrica                           | Valor                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Total tasks                       | **83** (T-UI-001..029 + T-UI-101..110 + T-UI-201..210 + T-UI-301..310 + T-UI-401..416 + T-UI-501..508) |
| Hechas                            | **81**                                                                                                 |
| Pending (user-owned)              | **2** — T-UI-505 (sweep Lighthouse p95 < 2s), T-UI-506 (sign-off manual de QA)                         |
| Otras (blocked/skipped/cancelled) | **0**                                                                                                  |

### Por qué las 2 tareas user-owned NO bloquean el archive

Per el brief del orchestrator (el launch prompt de esta fase) y
el design §16.6 del slice 6, las dos tareas pending están
**intencionalmente** left `pending (user-owned)` porque el
orchestrator no puede correrlas en el entorno actual:

- **T-UI-505** — Lighthouse p95 < 2s en `/` + `/dashboard` +
  `/transactions`. La verify gate corre `pnpm build && pnpm start &`
  - tres invocaciones del CLI de `lighthouse` contra el dev
    server corriendo. Localmente `pnpm run build` está BLOQUEADO
    por falta de `.env` (gap pre-existente del proyecto documentado
    desde el slice 1). El usuario tiene el `.env` + el dev server
    corriendo. Los comandos del CLI están documentados verbatim en
    `docs/perf/transactions-ui.md` §3 con placeholders de resumen
    JSON en §4. **Si p95 > 2s en el dashboard, la mitigación
    §16.5 del design parte las tres llamadas paralelas del
    dashboard en dos chunks.**
- **T-UI-506** — Sign-off manual de QA (REQ-UI-11). La sección
  de sign-off de `docs/qa/transactions-ui.md` §9 está
  intencionalmente en blanco; el usuario corre el checklist de
  keyboard-nav + screen-reader + dark-mode (30–45 min)
  post-merge y llena la sección.

Las dos tareas quedan en el `tasks.md` archivado con la
anotación `pending (user-owned)`. Las secciones del slice 5 y
slice 6 de `openspec/changes/transactions-ui/apply-progress.md`
ya documentan la razón user-owned explícitamente (en EN + ES
inline mirrors para el slice 6). Esta fase de archive no
reconcilia ni remueve los dos checkboxes; los preserva como el
registro del proyecto de que el ciclo cerró limpio con los dos
user follow-ups conocidos encolados.

El brief del orchestrator es explícito: **"Do NOT block archive
on these 2 — record the reason in the archive report and
proceed."** Esta sección es ese registro.

---

## 5. Contenido del archive (destino)

```
openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NUEVO — este archivo, reporte de fase sdd-archive)
├── proposal.md         (Status: draft → archived 2026-06-29)
├── design.md           (3,188 LoC; 20 secciones; status: draft — preservado as-is)
├── tasks.md            (Status: slices 1..6 implemented; 81/83 hechas; 2 user-owned)
├── apply-progress.md   (2,132 LoC + 2 secciones nuevas `## Archive closure`: EN + ES)
└── specs/
    ├── ui/spec.md              (espejo verbatim de la delta canónica)
    └── transactions/spec.md    (delta REQ-TX-15 REPLACED)

Documents-es/openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NUEVO — reporte de fase sdd-archive, ES)
├── proposal.md         (Estado: archivado 2026-06-29)
├── design.md
├── tasks.md            (Status slices 1..6; 81/83; 2 user-owned)
├── apply-progress.md   (NUEVO — puntero delgado + cierre ES)
└── specs/
    ├── ui/spec.md
    └── transactions/spec.md
```

---

## 6. Sync del espejo en español — todos los pares verificados

| Par de archivos                                                                                                | Resultado del diff                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `openspec/changes/transactions-ui/proposal.md` ↔ `Documents-es/.../proposal.md`                               | Solo traducción (`Author`/`Autor` + prosa). Estructura + headings 1:1.                                              |
| `openspec/changes/transactions-ui/design.md` ↔ `Documents-es/.../design.md`                                   | Solo traducción. Estructura + headings + code blocks 1:1.                                                           |
| `openspec/changes/transactions-ui/tasks.md` ↔ `Documents-es/.../tasks.md`                                     | Solo traducción. Tablas de tasks 1:1; campo de status actualizado a wording post-archive idéntico en ambos idiomas. |
| `openspec/changes/transactions-ui/specs/ui/spec.md` ↔ `Documents-es/.../specs/ui/spec.md`                     | Solo traducción. 11 Requirements 1:1.                                                                               |
| `openspec/changes/transactions-ui/specs/transactions/spec.md` ↔ `Documents-es/.../specs/transactions/spec.md` | Solo traducción. REQ-TX-15 REPLACED 1:1.                                                                            |
| `openspec/specs/ui/spec.md` ↔ `Documents-es/.../specs/ui/spec.md`                                             | Solo traducción. 11 Requirements 1:1.                                                                               |
| `openspec/specs/transactions/spec.md` ↔ `Documents-es/.../specs/transactions/spec.md`                         | Solo traducción. Puntero delgado de REQ-TX-15 1:1.                                                                  |

**Un gap pre-existente (flageado, no introducido por el archive):**
el `apply-progress.md` EN (2,132 LoC) NO está espejado verbatim
en `Documents-es/.../apply-progress.md`. El archivo EN contiene
secciones ES in-line para los slices 4–6 (la decisión de los
slice workers durante apply), pero no existía un archivo ES
separado bajo `Documents-es/`. La fase de archive crea el
espejo ES como un **archivo puntero delgado** que contiene solo
la sección de cierre de archivo traducida. Un housekeeping
futuro puede backfill la traducción ES completa de los slices
1–3 (ver flag F1 en §8).

---

## 7. Source of truth actualizada

Las siguientes specs canónicas ahora reflejan el nuevo
comportamiento:

- **`openspec/specs/ui/spec.md`** — capability nueva; 11
  Requirements (REQ-UI-1 a REQ-UI-11) cubriendo los tokens
  del sistema de diseño, el inventario de primitives +
  layout-shell, los query flags aditivos en `/api/accounts` y
  `/api/transactions`, la state machine de list-page, el
  month switcher del dashboard, el piso WCAG 2.2 AA a11y, y
  el checklist de QA manual user-owned.
- **`openspec/specs/transactions/spec.md`** — REQ-TX-15
  REEMPLAZADA con un puntero delgado a `openspec/specs/ui/spec.md`.
  El wording de smoke UI se removió; la superficie de UI de
  producción es owned por la capability `ui`.

El slot de la capability `ui` en `openspec/config.yaml:15`
ahora está lleno. La evolución futura de UI (`ui-dark-mode`,
`ui-i18n`, `ui-charts`) aterriza como adiciones a la
capability `ui`, no como revisiones adicionales de REQ-TX-N
en `transactions/spec.md`.

---

## 8. Preguntas abiertas / flags

- **F1 (pre-existente, no introducido por este archive).** El
  espejo ES del `apply-progress.md` EN es un puntero delgado
  que cubre solo la sección de cierre de archivo, no una
  traducción completa. Es un anti-pattern del ecosistema §10.3
  en espíritu pero no en letra (el archivo EN ya contiene
  secciones ES in-file para los slices 4–6). **Recomendación:**
  un housekeeping futuro
  (`chore/docs-backfill-transactions-ui-apply-progress-es`)
  puede backfill la traducción ES completa de los slices 1–3.
  **Owner:** usuario (decide si el espejo parcial es aceptable
  o si vale la pena backfill). **Qué confirmar:** si el
  usuario quiere el backfill, o si el patrón in-file ES en la
  fuente EN es aceptable.
- **F2 (acción del usuario, no bloqueante).** T-UI-505 +
  T-UI-506 quedan `pending (user-owned)`. El `tasks.md`
  archivado preserva este estado a propósito; el orchestrator
  no re-abre el cambio. **Owner:** usuario. **Qué confirmar:**
  cuando el usuario corra el sweep de Lighthouse + el checklist
  manual de QA post-merge, firma (cerrando el loop) o abre un
  cambio de follow-up (`fix/ui-...` o `feat/ui-...`) si un
  hallazgo requiere trabajo.
- **F3 (patrón nuevo, documentado).** Este `archive-report.md`
  es **el primero** de su tipo en la historia de archivos de
  este proyecto. Los 5 archivos previos (`auth-foundation`,
  `auth-foundation-slice-c`, `2026-06-19-accounts-ledger`,
  `2026-06-21-fx-cache`, `2026-06-24-transactions`,
  `2026-06-27-reports`) cerraron todos con updates de
  `Status:` en `apply-progress.md` + `proposal.md` + `tasks.md`
  pero sin artefacto `archive-report.md`. El `sdd-archive`
  SKILL.md §Step 5 lo hace mandatorio; el brief del orchestrator
  lo pidió explícitamente. **Recomendación:** las fases futuras
  de `sdd-archive` siguen este patrón (archivo + observación
  Engram `sdd/<change>/archive-report`). **Qué confirmar:**
  adoptar el patrón a nivel proyecto.

---

## 9. Ciclo SDD completo

El cambio `transactions-ui` fue completamente:

1. **Planeado** — proposal v1 (704 LoC) + design v1 (3,188 LoC,
   20 secciones) + delta de spec de 11 requirements + tracker
   de 83 tasks con estrategia de entrega force-chained
   400-line-budget.
2. **Implementado** — 6 PRs de slice chained (#98 → #103) +
   PR de cleanup 4R (#104), todos mergeados en `develop` en
   `508b258`. ~2,000 LoC a través de 6 slices, dentro del
   forecast 1,520–2,220 del design.
3. **Verificado** — el slice 5 aterrizó axe-core a11y +
   visual snapshots + E2E happy paths; el slice 6 agregó el
   checklist de QA manual + verificación de budget de perf +
   referencia del sistema de diseño. Las 2 tareas de
   verificación restantes son explícitamente user-owned per
   design §16.6 y el brief del orchestrator.
4. **Sincronizado** — `openspec/specs/ui/spec.md` creada
   (verbatim desde delta) y `openspec/specs/transactions/spec.md`
   modificada (REQ-TX-15 REPLACED con puntero delgado). Ambas
   promociones aterrizaron en `develop` vía el commit `ec2e589`
   del slice 6.
5. **Archivado** — esta fase mueve la carpeta del cambio a
   `openspec/changes/archive/2026-06-29-transactions-ui/` y
   registra el ciclo en este `archive-report.md` + la
   observación de Engram `sdd/transactions-ui/archive-report`.

La capability `ui` es ahora una capability de primera clase
del proyecto. El próximo cambio SDD puede arrancar (los
próximos candidatos obvios son `networth-snapshot` per la
pista "Downstream" de la propuesta, o `ui-dark-mode` per la
nota REQ-TX-15 REPLACED, o `ui-i18n` per las secciones de
extensibilidad del sistema de diseño).

---

## 10. Observación Engram (modo hybrid)

Per el brief del orchestrator (modo hybrid) y el `sdd-archive`
SKILL.md §Step 5 + `sdd-phase-common.md` §C:

- `topic_key`: `sdd/transactions-ui/archive-report`
- `type`: `architecture`
- `capture_prompt`: `false` (es un artefacto automatizado, no
  un save de memoria humano/proactivo)
- `scope`: `project`
- `content`: versión condensada de este reporte (≤ 2 KB) con
  todos los números de PR, fechas, paths de archivo, y el
  reconocimiento explícito de las tareas user-owned.

El observation ID se reporta en el resumen de retorno del
executor (ver `acceptance-report`).

---

## 11. Commit (atómico, un solo commit en `chore/transactions-ui-archive`)

- Mover `openspec/changes/transactions-ui/` →
  `openspec/changes/archive/2026-06-29-transactions-ui/`
  (fuente inglesa: 6 archivos + 2 archivos de spec)
- Mover `Documents-es/openspec/changes/transactions-ui/` →
  `Documents-es/openspec/changes/archive/2026-06-29-transactions-ui/`
  (espejo en español: 4 archivos + 2 archivos de spec)
- Actualizar el campo `Status:` de `proposal.md` (EN + ES) a
  `archived (2026-06-29, sdd-archive after PR #104)`
- Actualizar el campo `Status:` de `tasks.md` (EN + ES) para
  reflejar el estado post-archive (slices 1..6; 81/83 hechas;
  2 user-owned)
- Agregar `## Archive closure — 2026-06-29 (PR #104, sdd-archive)`
  a `apply-progress.md` (EN) y
  `## Archive closure — 2026-06-29 (PR #104, sdd-archive) — mirror (castellano)`
  al mismo archivo (matcheando el patrón bilingüe in-file que
  los slice workers usaron para los slices 4–6)
- Crear `apply-progress.md` (ES) en
  `Documents-es/.../archive/2026-06-29-transactions-ui/apply-progress.md`
  como un archivo puntero delgado con el cierre de archivo
  en ES
- Crear `archive-report.md` (EN + ES) en
  `openspec/.../archive/2026-06-29-transactions-ui/archive-report.md`
  y el espejo ES
- Mensaje del commit:
  `chore(sdd): archive transactions-ui (sdd-archive phase, 6 slices + 4R cleanup all merged)`

No se toca código de producción. No hay bump de versión (esto
no es un release per `AGENTS.md` raíz §5.5; la entrada
`[Unreleased]` de `CHANGELOG.md` ya aterrizó en el slice 6
T-UI-504). No hay cambio en `openspec/config.yaml` (el slot
de la capability `ui` en la línea 15 fue reservado antes de
que el cambio arrancara y ahora está lleno con la spec
canónica).
