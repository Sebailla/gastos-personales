# Apply Progress — `transactions-ui` — Espejo en castellano (cierre de archivo)

**Autor**: Sebastián Illa
**Cambio**: `transactions-ui`
**Fecha**: 2026-06-29
**Modo**: sdd-archive · hybrid (filesystem + Engram)

> **Aviso de scope.** Este archivo es el **espejo delgado en
> castellano** del `openspec/changes/transactions-ui/apply-progress.md`
> inglés (2,132 LoC). Por decisión de los slice workers durante
> apply, el archivo EN contiene **secciones en castellano in-line**
> para los slices 4–6 (no había un archivo ES separado). Este
> archivo bajo `Documents-es/.../archive/2026-06-29-transactions-ui/`
> fue creado por la fase de `sdd-archive` para cerrar el gap
> §13.3 del contrato raíz y el `openspec/AGENTS.md`; contiene
> **solo la sección de cierre de archivo (Archive closure)
> traducida**, no una traducción completa de las 2,132 LoC.
>
> Un housekeeping futuro
> (`chore/docs-backfill-transactions-ui-apply-progress-es`) puede
> backfill la traducción ES completa de los slices 1–3 si el
> usuario quiere paridad estricta EN↔ES a nivel de archivo para
> `apply-progress.md`. Ver flag F1 en
> `openspec/changes/archive/2026-06-29-transactions-ui/archive-report.md`
> §8.

---

## Archive closure — 2026-06-29 (PR #104, sdd-archive) — espejo (castellano)

**Autor**: Sebastián Illa
**Branch**: `chore/transactions-ui-archive` (desde `develop` post #104)
**Inicio**: 2026-06-29 · **Fin**: 2026-06-29
**Modo**: sdd-archive · hybrid (filesystem + Engram)

### Objetivo

Cerrar el ciclo SDD de `transactions-ui`. El cambio aterrizó 6
PRs de slice (#98 → #103) más el PR de cleanup 4R (#104) en
`develop`. Todas las tareas de implementación están hechas
(`81/83` en `tasks.md`). Dos tareas de verificación quedan
`pending (user-owned)` — T-UI-505 (sweep Lighthouse p95 < 2s)
y T-UI-506 (sign-off manual de QA). Estas NO bloquean el
archive: el orchestrator las registró explícitamente como
user-owned en las notas de progreso del slice 5 y slice 6; el
riesgo §16.6 del design del slice 6 lockea al usuario como
owner del checklist manual de QA; y `pnpm run build` está
bloqueado localmente por falta de `.env` (condición
pre-existente documentada desde el slice 1).

### Task Completion Gate — pasa con razón explícita user-owned

| Total | Done | Pending (user-owned)   | Otros |
| ----- | ---- | ---------------------- | ----- |
| 83    | 81   | 2 (T-UI-505, T-UI-506) | 0     |

Las dos tareas `pending (user-owned)` son:

- **T-UI-505** — Lighthouse p95 < 2s en `/` + `/dashboard` +
  `/transactions`. Owner: usuario. Los comandos del CLI están
  documentados en `docs/perf/transactions-ui.md` §3;
  placeholders de resumen JSON en §4. El usuario corre
  `pnpm build && pnpm start &` y las tres invocaciones de
  `lighthouse` post-merge.
- **T-UI-506** — Sign-off manual de QA (REQ-UI-11). Owner:
  usuario. El checklist en `docs/qa/transactions-ui.md` §9
  tiene una sección de sign-off en blanco. El usuario corre
  el checklist de keyboard-nav + screen-reader + dark-mode
  (30–45 min) y firma.

Las dos tareas quedan en el `tasks.md` archivado con la
anotación `pending (user-owned)`. El archive report
(`archive-report.md`) lo registra para que sesiones futuras
sepan que el ciclo cerró limpio y que las 2 restantes son
user-owned.

### Spec sync (delta → canónica)

- **`openspec/specs/ui/spec.md`** — CREADA en `develop` por
  el slice 6 (T-UI-507, commit `ec2e589`). 11 Requirements
  (REQ-UI-1 a REQ-UI-11), lift verbatim desde
  `openspec/changes/transactions-ui/specs/ui/spec.md`. La
  delta en la carpeta del cambio se mantiene en lockstep;
  la canónica es la source of truth.
- **`openspec/specs/transactions/spec.md`** — MODIFICADA en
  `develop` por el slice 6 (T-UI-508, commit `ec2e589`).
  REQ-TX-15 está REEMPLAZADA con un puntero delgado a
  `openspec/specs/ui/spec.md` REQ-UI-1 a REQ-UI-11.
  REQ-TX-1 a REQ-TX-14 quedan sin cambios desde la canónica
  previa (última sync 2026-06-22, transactions).
- **Todos los espejos en español en sync.** Verificado vía
  `diff` de cada par EN↔ES (delta + canónica) y de los
  pares `proposal.md` / `tasks.md` / `design.md`. Las únicas
  diferencias son el campo esperado `Author`↔`Autor` y las
  traducciones de prosa EN↔ES; la estructura, los
  requirements y los code blocks son 1:1.
- **Un gap pre-existente (flageado):** el `apply-progress.md`
  inglés (2,132 LoC) NO está espejado verbatim en
  `Documents-es/.../apply-progress.md`. El archivo EN
  contiene secciones ES in-line para los slices 4–6 (la
  decisión de los slice workers durante apply), pero no
  existía un archivo ES separado bajo `Documents-es/`. Esta
  sección de cierre en castellano vive en este archivo
  delgado. La traducción ES completa de los slices 1–3
  queda como housekeeping futuro.

### Contenido del archive (carpeta destino)

```
openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NUEVO — reporte de fase sdd-archive)
├── proposal.md         (Status: draft → archived 2026-06-29)
├── design.md
├── tasks.md            (Status: slices 1..6 implemented; 81/83 done; 2 user-owned)
├── apply-progress.md   (2,132 LoC + 2 secciones nuevas `## Archive closure`: EN + ES)
└── specs/
    ├── ui/spec.md              (espejo verbatim de la delta canónica)
    └── transactions/spec.md    (delta REQ-TX-15 REPLACED)

Documents-es/openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NUEVO — reporte de fase sdd-archive, ES)
├── proposal.md         (Estado: archivado 2026-06-29)
├── design.md
├── tasks.md            (Status slices 1..6; 81/83; 2 user-owned)
├── apply-progress.md   (ESTE ARCHIVO — puntero delgado + cierre ES)
└── specs/
    ├── ui/spec.md
    └── transactions/spec.md
```

### Source of truth actualizada

Las siguientes specs canónicas ahora reflejan el nuevo
comportamiento:

- `openspec/specs/ui/spec.md` — REQ-UI-1 a REQ-UI-11
  (capability nueva; primera escritura).
- `openspec/specs/transactions/spec.md` — REQ-TX-15
  REEMPLAZADA con un puntero delgado a `ui/spec.md`.

### Ciclo SDD completo

El cambio `transactions-ui` fue completamente planeado
(proposal + spec + design + tasks), implementado
(6 PRs chained + cleanup 4R, todos mergeados en `develop`),
verificado (slices 1–6 con las 2 tareas user-owned
explícitamente reconocidas), sincronizado (spec canónica
promovida), y archivado. La capability `ui` es ahora una
capability de primera clase del proyecto. El próximo ciclo
SDD puede arrancar.

### Preguntas abiertas / flags

- **F1 (pre-existente, no introducido por el archive).** El
  espejo ES del `apply-progress.md` EN es un puntero delgado
  que cubre solo el cierre de archivo, no una traducción
  completa. Es un anti-pattern del ecosistema §10.3 en
  espíritu pero no en letra (el archivo EN ya contiene
  secciones ES in-file para los slices 4–6). Un housekeeping
  futuro puede backfill la traducción ES completa de los
  slices 1–3 si el usuario quiere paridad estricta EN↔ES para
  `apply-progress.md`.
- **F2 (acción del usuario, no bloqueante).** T-UI-505 +
  T-UI-506 quedan `pending (user-owned)`. El `tasks.md`
  archivado preserva este estado a propósito; el orchestrator
  no re-abre el cambio. El usuario corre el sweep de
  Lighthouse + el checklist manual de QA post-merge y firma
  o abre un follow-up.
- **F3 (patrón nuevo, documentado).** Este `archive-report.md`
  es el primero de su tipo en la historia de archivos de
  este proyecto. La fase de `sdd-archive` SKILL.md §Step 5
  lo hace mandatorio; el brief del orchestrator lo pidió
  explícitamente. Las fases futuras de `sdd-archive` siguen
  este patrón (archivo + observación Engram
  `sdd/<change>/archive-report`).

### Próximo paso

- El orchestrator abre un PR desde
  `chore/transactions-ui-archive` a `develop`. Título del PR:
  `chore(sdd): archive transactions-ui (sdd-archive phase, 6 slices + 4R cleanup all merged)`.
- Después de que el usuario revise y squash-merge el PR, el
  cambio `transactions-ui` queda oficialmente cerrado. El
  próximo cambio SDD puede arrancar (los próximos candidatos
  obvios son `networth-snapshot` per la pista "Downstream" de
  la propuesta, o `ui-dark-mode` per la nota REQ-TX-15
  REPLACED, o `ui-i18n` per las secciones de extensibilidad
  del sistema de diseño).
