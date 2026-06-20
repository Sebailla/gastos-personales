# Handoff — Cierre de Re-open — `auth-foundation-slice-c`

**Estado**: closed-via-archive · **Autor**: Sebastián Illa · **Fecha**: 2026-06-18

## Qué es ahora verdadero

Este directorio (`openspec/changes/auth-foundation-slice-c/`) es un **re-open** del
cambio `auth-foundation-slice-c` que ya fue cerrado por completo en una sesión
anterior (2026-06-13/14). El cierre queda registrado acá para que quien
aterrice en este directorio en el futuro entienda la relación entre los
artefactos de planificación activos y el lifecycle ya completado en
`openspec/changes/archive/auth-foundation-slice-c/`.

## Lifecycle del cambio original (2026-06-13/14)

| Fase    | Estado  | Evidencia                                                                                                                                                                                                                 |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apply   | ✅ done | PRs #19 (C-1), #20 (C-2), C-3 (docs+handoff). 14 tasks completos: T-C1.0 + T-025..T-033. `openspec/changes/archive/auth-foundation-slice-c/apply-progress.md` registra cada commit.                                       |
| verify  | ✅ done | `openspec/changes/archive/auth-foundation-slice-c/verify-report.md` — estado `PASS_WITH_FLAGS`. Sin blockers CRITICAL. Dos flags WARNING heredados del verify del Slice A+B padre.                                        |
| sync    | ✅ done | `openspec/changes/archive/auth-foundation-slice-c/sync-report.md` — estado `synced`. 11 de 16 deltas promovidas a `openspec/specs/auth/spec.md` (canonical, EN) y `Documents-es/openspec/specs/auth/spec.md` (espejo ES). |
| archive | ✅ done | Tanto `auth-foundation` como `auth-foundation-slice-c` se movieron a `openspec/changes/archive/` el 2026-06-14.                                                                                                           |

## Estado de los flags en este re-open

El verify-report del 2026-06-14
(`openspec/changes/archive/auth-foundation-slice-c/verify-report.md`)
flageó dos ítems WARNING. Su estado al momento de este commit
(2026-06-18):

| Flag                                                                                          | Severidad                        | Estado                                             | Evidencia                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLAG-1 (module-resolution bug, issue #18)                                                     | CRITICAL → cerrado en C-1        | ✅ resolved                                        | PR #19 (commit `f055938`) agregó el parche `resolve.alias` y el stub `test/stubs/next-server.ts` de 30 líneas. Tres archivos de test antes excluidos ahora corren.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| FLAG-V1 (test count drift, 132/135 vs spec target 137/137)                                    | WARNING                          | ✅ resolved (by obsolescence) — cerrado 2026-06-18 | El target "137/137" era un número de planificación del Slice C que fue superado por crecimiento orgánico: PR #22 (`feat(auth): Next 16 alignment + Google OAuth unblock + observability + rate-limit + register`) mergeado el 2026-06-17 agregó register page, rate-limit middleware, observability, Google OAuth unblock — neto +85 tests. Estado actual en `develop` (verificado 2026-06-18): **222 tests / 45 files, 0 failures**, muy por encima del target 137/137. La spec canónica `openspec/specs/auth/spec.md` ya documenta el test method real (vi.mock sobre el módulo `authjs` del proyecto + chequeos estáticos del source text, per la "Test method note" en §586) — NO menciona "137/137" porque el sync del 2026-06-14 promovió el approach real y descartó el número obsoleto. El "132/135" era el test count _en el momento del verify_ (2026-06-14); el WARNING era que el acceptance criterion #2 de la spec decía "137/137" mientras la realidad era "132/135". El path de resolución elegido: **obsolescencia** — el target fue superado, no regresado. Re-agregar los 2 casos runtime DUMMY_HASH (el path que el body del commit describía como "integration coverage of next-auth actually mounts") queda como follow-up explícito si el usuario quiere cobertura más fuerte de esa superficie. |
| FLAG-V2 (next-auth@5.0.0-beta.25 en dev machines vs pinned 5.0.0-beta.31)                     | WARNING                          | ✅ resolved on this machine                        | Verificado 2026-06-18: `node_modules/next-auth/package.json` reporta `5.0.0-beta.31`, matcheando el pin en `package.json` y el lockfile. Cualquier `pnpm install --frozen-lockfile` fresco (CI hace esto en cada corrida) resuelve la drift. Per verify-report §3.2: "CI is the authoritative gate". No requiere más acción.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| FLAG-2 (bilingual drift en `Documents-es/openspec/changes/auth-foundation/apply-progress.md`) | WARNING → cerrado en C-3 handoff | ✅ resolved                                        | El commit handoff del C-3 re-sincronizó el espejo español.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Por qué existe este re-open

Este directorio permaneció en `openspec/changes/` (en lugar de moverse a
`archive/` junto con el original) porque el directorio archive del cambio
padre (`openspec/changes/archive/auth-foundation/`) se configuró sin un
`verify-report.md` ni un `sync-report.md`. La convención es que un
re-open queda activo hasta que todos los flags del padre estén cerrados.
Al 2026-06-18, **todos los flags están resueltos** (FLAG-V1 por
obsolescencia, ver la tabla arriba), así que este re-open está
completamente cerrado y podría moverse a
`archive/auth-foundation-slice-c-reopen/` en un housekeeping pass
futuro. Ese movimiento se difirió intencionalmente acá para mantener
el scope del PR chico.

## Estado de los artefactos en este directorio

Los cuatro artefactos de planificación (`proposal.md`, `spec.md`,
`design.md`, `tasks.md`) se preservan verbatim de la planificación
original. El header `Status` se actualizó de `draft` / `ready-for-apply`
a `closed-via-archive` para reflejar el estado real. Los checkboxes
de las tasks en `tasks.md` quedan intencionalmente en su estado
original `[ ]` — el registro canónico de completitud vive en
`openspec/changes/archive/auth-foundation-slice-c/tasks.md` (donde las
mismas tasks están `[x]`).

## Qué se necesita para arrancar el próximo SDD change

Las seis capabilities que fueron desbloqueadas por el cierre de
`auth-foundation` (`accounts-ledger`, `transactions`, `fx-cache`,
`networth-snapshot`, `reports-mvp`, `pwa-shell`, `fly-deploy`) están
técnicamente desbloqueadas desde el 2026-06-14. Este cierre de
re-open es bookkeeping, no un gate.

Próximo movimiento recomendado: `/sdd-new accounts-ledger` (o la
capability que el usuario elija). Corré el SDD preflight, después
`sdd-init` → `sdd-proposal`.

## Archivos modificados por este handoff

- `openspec/changes/auth-foundation-slice-c/HANDOFF.md` (este archivo, nuevo)
- `openspec/changes/auth-foundation-slice-c/proposal.md` — header `Status` actualizado
- `openspec/changes/auth-foundation-slice-c/spec.md` — header `Status` actualizado
- `openspec/changes/auth-foundation-slice-c/design.md` — header `Status` actualizado
- `openspec/changes/auth-foundation-slice-c/tasks.md` — header `Status` actualizado

No se tocó código fuente. No se tocaron tests. No se tocó
`openspec/specs/auth/spec.md` (el canónico ya incluye los deltas
sincronizados del 2026-06-14).
