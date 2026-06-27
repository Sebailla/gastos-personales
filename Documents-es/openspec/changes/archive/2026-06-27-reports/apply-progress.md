# Apply Progress — `reports` (slice 4 de 4: `dashboard-ui`)

**Autor**: Sebastián Illa
**Change**: `reports`
**Modo**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR)
**Slice**: 4 de 4 (dashboard-ui, feat/reports-4-dashboard-ui)
**Branch base**: `develop` (post-merge de los slices 1, 2, 3 — #76/#77/#78/#79/#80 + #81 I-RPT-3.1 + #82 husky fix)
**Inicio**: 2026-06-27
**Fin**: 2026-06-27

---

## Goal

Aterrizar el smoke UI per design §9.2: tres presentational Server
Components (`MonthlySummaryCard`, `CategoryBreakdownCard`,
`AccountFlowCard`) + la dashboard RSC page
(`app/dashboard/page.tsx`) con el empty-state CTA. El dashboard
NO deep-linkea al flow endpoint en v1 — la card `flow` siempre
está empty hasta que un cambio futuro agregue el account picker.

Después del slice 4 la capability `reports` está completa del
lado de la API; el orquestador corre entonces `sdd-verify` y
`sdd-sync` (canonical spec en `openspec/specs/reports/spec.md`)
y `sdd-archive`.

---

## Tasks completadas (slice 4 — 8/8)

| ID        | Título                                                      | Commit                              | Evidencia RED/GREEN                                                                                                                                                  |
| --------- | ----------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-RPT-301 | RED: `report-types.ts` test assertea wire shapes            | `8d12274` (combinado con T-RPT-302) | RED: `Error: Failed to load url ./report-types` (namespace import fuerza resolución en runtime; esbuild borra `import type`)                                         |
| T-RPT-302 | GREEN: `report-types.ts` (DTO mirror for RSC)               | `8d12274`                           | GREEN: 8/8 wire-shape assertions pass                                                                                                                                |
| T-RPT-303 | RED → GREEN: `MonthlySummaryCard` snapshot                  | `0114ab2`                           | RED: `Error: Failed to load url ./dashboard-monthly-summary`; GREEN: 2/2 snapshots pass                                                                              |
| T-RPT-304 | RED → GREEN: `CategoryBreakdownCard` snapshot               | `a749ba2`                           | RED: `Error: Failed to load url ./dashboard-category-breakdown`; GREEN: 2/2 snapshots pass                                                                           |
| T-RPT-305 | RED → GREEN: `AccountFlowCard` snapshot (always empty v1)   | `bf0cbe7`                           | RED: `Error: Failed to load url ./dashboard-account-flow`; GREEN: 1/1 snapshot passes; gga forzó drop de la prop `flow` no usada (regla §10.5 Surgical / Simplicity) |
| T-RPT-306 | RED: `app/dashboard/page.test.tsx` + `page.seeded.test.tsx` | `44b2246`                           | RED: `Error: Failed to load url ./page`; GREEN: 2/2 snapshots pass después de que T-RPT-307 aterrizara                                                               |
| T-RPT-307 | GREEN: `app/dashboard/page.tsx` RSC                         | `fdc46de`                           | GREEN: 2/2 snapshots pass; Zod schemas locales para validación de response (§10.5 Input validation)                                                                  |
| T-RPT-308 | DOCS: surface "(UTC)" label + CTA doc comment               | `4835de1`                           | Inline comments en cada card + target del CTA; sin cambio de comportamiento                                                                                          |

---

## Archivos cambiados (slice 4)

| Archivo                                                 | Acción     | LoC      |
| ------------------------------------------------------- | ---------- | -------- |
| `app/_lib/report-types.ts`                              | Creado     | 86       |
| `app/_lib/report-types.test.ts`                         | Creado     | 166      |
| `app/_components/dashboard-monthly-summary.tsx`         | Creado     | 87       |
| `app/_components/dashboard-monthly-summary.test.tsx`    | Creado     | 73       |
| `app/_components/dashboard-category-breakdown.tsx`      | Creado     | 88       |
| `app/_components/dashboard-category-breakdown.test.tsx` | Creado     | 97       |
| `app/_components/dashboard-account-flow.tsx`            | Creado     | 43       |
| `app/_components/dashboard-account-flow.test.tsx`       | Creado     | 32       |
| `app/dashboard/page.tsx`                                | Creado     | 192      |
| `app/dashboard/page.test.tsx`                           | Creado     | 93       |
| `app/dashboard/page.seeded.test.tsx`                    | Creado     | 114      |
| `openspec/changes/reports/tasks.md`                     | Modificado | +10, -10 |

Total: 1077 inserciones a través de 11 archivos. LoC por commit
permanece dentro del budget 200-320 LoC por commit (75-252
inserciones). El total del slice supera el forecast 200-320 por
slice porque los snapshot tests son substanciales; el orquestador
surfacea el `git diff --stat` real por el contrato de
work-unit-commits.

---

## Evidencia del ciclo TDD

| Task      | ¿RED verificado?                                         | ¿GREEN verificado?         | ¿Refactor?                                                                     |
| --------- | -------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------ |
| T-RPT-301 | Sí (`Failed to load url ./report-types`)                 | Sí (8/8)                   | No                                                                             |
| T-RPT-303 | Sí (`Failed to load url ./dashboard-monthly-summary`)    | Sí (2/2)                   | No                                                                             |
| T-RPT-304 | Sí (`Failed to load url ./dashboard-category-breakdown`) | Sí (2/2)                   | No                                                                             |
| T-RPT-305 | Sí (`Failed to load url ./dashboard-account-flow`)       | Sí (1/1)                   | gga forzó drop de la prop `flow` no usada (§10.5 Surgical)                     |
| T-RPT-306 | Sí (`Failed to load url ./page`)                         | Sí (2/2 across both files) | gga forzó split de empty/seeded en dos files (sin `currentFixture` compartido) |
| T-RPT-307 | n/a (depende de T-RPT-306)                               | Sí (2/2)                   | gga forzó Zod parsing de response bodies (§10.5 Input validation)              |

---

## Verificación

```bash
$ pnpm typecheck
> tsc --noEmit
(exit 0, sin errores)

$ pnpm test app/_components/dashboard-*.test.tsx app/dashboard/
 Test Files  5 passed (5)
      Tests  7 passed (7)

$ pnpm test
 Test Files  132 passed | 1 skipped (133)
      Tests  805 passed | 4 skipped (809)
   Duration  4.26s

$ pnpm test:coverage:enforced
 All files          |    96.5 |    90.99 |   83.46 |    96.5 |
(Todos los thresholds ≥ 80% satisfechos)

$ pnpm build
(exit 0; /dashboard registrado como `ƒ (Dynamic)`)
```

---

## Desviaciones del diseño

### 1. Dos archivos de test para el dashboard page en vez de uno

La descripción de la task sugiere un único `page.test.tsx` con
los casos empty + seeded snapshot. El primer draft usaba un
`currentFixture` selector mutable compartido para alternar entre
los casos en un solo file. gga lo flagueó como "stateful test
logic" (§10.5 No logic in tests) y requirió splittear los casos
en dos files (`page.test.tsx` + `page.seeded.test.tsx`). Cada
file tiene su propia mock factory pura y declarativa (lookup
table por path-prefix). Sin cambio de comportamiento; contrato
más limpio per la lectura estricta del reviewer.

### 2. Zod schemas locales para validación de response

La descripción de la task no menciona Zod parsing en el page; el
precedente en `app/transactions/page.tsx` usa un cast TypeScript
`as TransactionsListResponse`. El primer draft hizo lo mismo.
gga flagueó el cast `as` como violación §10.5 "Input validation"
(solo compile-time, sin check en runtime). Fix: declarar Zod
schemas locales (`monthlySummaryResponseSchema`,
`categoryBreakdownResponseSchema`, `errorEnvelopeSchema`) al
lado del page y `.parse(await res.json())` en vez de castear.
Los schemas mirrorean `app/_lib/report-types.ts` verbatim — el
UI no puede importar de `src/modules/reports/...` (regla de
arquitectura), así que el wire contract se mantiene a mano al
lado del page; drift entre el DTO mapper y los schemas del page
ahora surfacea como Zod parse error, no como type mismatch
silencioso.

### 3. AccountFlowCard signature simplificada

El primer draft aceptaba una prop `flow: AccountFlowDTO` y usaba
`void _flow;` para suprimir el warning de unused-var, justificándolo
como "future-proofing for the account picker". gga lo flagueó
como violación §10.5 "Surgical: only change what's necessary" /
"Simplicity" — código huérfano enmascarado como future-proofing.
Fix: drop la prop `flow` de `Props` en v1; el picker change la
re-agrega cuando aterrice. El page NO llama al flow endpoint en
v1 (design §9.2), así que la prop estaba dead en este commit de
todos modos.

### 4. Copy del dashboard en español per tasks.md §Slice 4

La descripción de la task especifica copy de UI en español
("Registrar primera transacción", "Resumen mensual", etc.). El
header del page mantiene el universal English `<h1>Dashboard</h1>`
y el marker `(UTC)`; el copy del body es español. Decisión de
locale documentada en el docblock del page header.

---

## Issues encontrados

Ninguno. El fix I-RPT-3.1 del slice 3 (commit `38a8083`) ya estaba
en `develop` antes de empezar este slice; el slice 4 es puramente
aditivo (archivos nuevos en `app/`).

---

## Artefactos de verificación

- `pnpm typecheck` → exit 0
- `pnpm test` → 805/805 passed, 4 skipped (DB testcontainers)
- `pnpm test:coverage:enforced` → 96.5% lines / 90.99% branches / 83.46% functions / 96.5% statements (todos ≥ 80%)
- `pnpm build` → exit 0; `/dashboard` registrado como `ƒ (Dynamic)` después de sembrar un `.env` dummy desde `.env.example`
- `gga run` → los 8 commits pasaron (cached o fresh)
- `git log --oneline origin/develop..feat/reports-4-dashboard-ui`:

```
201f4b1 chore(reports): mark slice 4 tasks complete in tasks.md
4835de1 docs(dashboard-ui): surface (UTC) label on each card + CTA doc comment
fdc46de feat(dashboard-ui): app/dashboard/page.tsx RSC with three-card grid + empty CTA
44b2246 test(dashboard-ui): dashboard page empty + seeded snapshot tests
bf0cbe7 feat(dashboard-ui): account flow card empty snapshot (v1 does not deep-link)
a749ba2 feat(dashboard-ui): category breakdown card with empty + populated snapshots
0114ab2 feat(dashboard-ui): monthly summary card with empty + populated snapshots
8d12274 feat(dashboard-ui): report-types wire shapes
```

8 commits en `feat/reports-4-dashboard-ui`.

---

## Status

**8/8 tasks del slice-4 completas.** Ready for `sdd-verify`.

- El smoke check de `pnpm dev` queda pendiente (orchestrator-side;
  el page está cubierto por los snapshot tests + los in-process
  Hono route integration tests del slice 3). El bloque
  `manual end-to-end` del verification gate en tasks.md
  §Slice 4 (sign in → /dashboard empty → CTA → /transactions/new →
  submit → land on /transactions → back to /dashboard populated)
  requiere un dev server real + Postgres + un browser
  autenticado; el agente no puede ejercitarlo.
