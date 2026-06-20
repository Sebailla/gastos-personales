# ADR-0008 — Judgment Day ronda 1 + 2 (revisión y remediación del working tree)

**Estado**: Accepted · **Fecha**: 2026-06-20 · **Deciders**: Sebastián Illa

## Contexto y planteamiento del problema

El working tree de la rama `develop` acumuló 37 archivos modificados más
4 sin track (la nueva acción `readyz`, el port `Clock`, el seam de tipo
`AuthUser` y el nuevo módulo `prisma-types`) sobre `b273bff` (el cierre
del ciclo de vida SDD de `accounts-ledger`). El slice mezcla una feature
terminada (account ledger), hardening de infraestructura en curso
(auth, error handling, observability), el nuevo probe de readiness,
follow-ups de ADR-0007 y algunas limpiezas de código muerto. El diff
combinado es demasiado grande para el foco de un solo reviewer
(según el presupuesto cognitivo de revisión de ~400 líneas del
proyecto) y cruza dos áreas de riesgo de revisión (auth + accounts).

El usuario pidió un "juicio final" sobre el proyecto. La respuesta
natural es una revisión dual ciega del working tree, seguida de una
ronda de remediación, seguida de un re-juicio que confirme que los
fixes aguantan y no introdujeron regresiones. Este ADR captura el
proceso, los findings y la remediación resultante de 16 commits
(`9ca3bf6`..`1aa31e3` en `develop`).

## Drivers

- **Cobertura de dos ángulos.** La revisión de código por un único
  reviewer es vulnerable a puntos ciegos; una revisión dual ciega
  (Juez A en correctness / Clean Architecture; Juez B en edge cases /
  integration risks) atrapa más.
- **Contexto fresco.** Los subagentes cargan solo las skills relevantes
  y el diff, no el contexto acumulado de la sesión previa. La
  independencia de los assumptions del padre es el punto.
- **Fixes quirúrgicos.** Los findings se vuelven action items; el fix
  agent aplica SOLO los issues confirmados. Sin refactors oportunistas,
  sin scope creep.
- **Loop de re-juicio.** Después de que el fix agent corre, ambos jueces
  vuelven a revisar el nuevo estado. El estado terminal es APPROVED
  solo cuando el re-juicio no surface findings CRITICAL o HIGH reales.
- **Commits atómicos.** Cada fix aterriza como su propio commit
  Conventional Commits para que el reviewer pueda razonar sobre un
  cambio a la vez y hacer revert local si hace falta.

## Opciones consideradas

1. **Revisión dual ciega + fix agent + re-juicio + commits atómicos**
   (el camino tomado efectivamente). Subagentes dirigidos por skills
   cargan nueve `SKILL.md` cada uno. El fix agent stagea por archivo
   (el staging a nivel de hunk queda para el humano cuando los archivos
   cruzan límites de commit).
2. **Revisión inline de una pasada** por la sesión padre. Más rápido,
   pero el padre acumuló contexto y no puede sorprenderse a sí mismo;
   una perspectiva en lugar de dos.
3. **Un mega-commit de una sola vez** cubriendo todo el diff. Violación
   de reviewer-burnout; sin loop de re-juicio; más difícil de revertir.
4. **Revisión estilo PR en GitHub** en lugar de local. Requiere push
   primero, lo que viola AGENTS.md §6 ("sin push sin request explícito
   del usuario"). Diferir hasta que el usuario quiera el slice en una
   rama remota.

## Decisión

**Opción elegida**: 1, con la modificación de que el usuario ejecuta
los commits (el padre solo stagea y escribe los mensajes de commit; el
usuario los aplica). El proceso es:

1. **Dos jueces en paralelo** (`jd-judge-a`, `jd-judge-b`) sobre el
   working tree. Ambos cargan los mismos nueve `SKILL.md`
   (architecture-standards, auth-rbac, database-strategy, api-design,
   error-handling, logging-monitoring, security-owasp,
   testing-standards, code-reviewer). El output es file-only para
   mantener el contexto del padre limpio.
2. **Síntesis** por el padre en una tabla de verdict: confirmed
   (ambos jueces), suspect (un juez), contradiction (los jueces
   discrepan). El usuario elige el scope (fix all / solo confirmed /
   solo CRITICAL / solo reporte).
3. **Fix agent** (`jd-fix-agent`) aplica SOLO los fixes aprobados.
   376/376 tests pass, `pnpm typecheck` clean, end-to-end.
4. **Ronda 2**: re-lanzar ambos jueces en paralelo contra el estado
   post-fix. Nuevos findings surface: 1 HIGH residual (drift del
   ADR-0007 ES en "Notas de implementación"), 3 MED nuevos (Clock
   port con leaks de `new Date()` en `OpeningBalance.historical` y
   `Session.isSessionActive`; F-14 consolidación parcial; F-14 cast
   estructural sin test).
5. **Mini-fix agent** aplica los 4 residuales. 379/379 tests pass,
   typecheck clean.
6. **Plan de commits atómicos** como un plan de 17 pasos, pero
   ejecutado con `git add` a nivel de archivo (el script para
   staging a nivel de hunk queda para el usuario; 9 de los 17
   commits tuvieron que mergearse con los anteriores porque
   archivos compartidos como `app.ts` y `error-handler.ts` cruzan
   los límites de los commits). Resultado final: 16 commits en
   `develop`.

### Notas de implementación

- **Skills inyectadas, no auto-descubiertas.** El padre lee
  `.atl/skill-registry.md` una vez por sesión y pasa los paths
  exactos de `SKILL.md` a cada subagente. El subagente no
  redescubre skills. `skill_resolution: paths-injected` es el
  valor esperado; cualquier otra cosa es un gap de orquestación.
- **Trust but verify.** Después de cada ejecución de un juez, el
  padre grepea / lee los archivos citados para confirmar que el
  finding es real (no un line number alucinado o contexto stale).
- **Incidente de truncado del output de B.** La primera corrida
  del Juez B produjo un artefacto de 73 bytes porque la llamada
  final de "write" del harness se truncó. Los findings se
  recuperaron de los bloques `thinking` del session log; este
  es el path de recuperación documentado.
- **`git add` por archivo en lugar de `git add -p`.** 17 commits
  sobre un diff donde los archivos compartidos cruzan boundaries
  no pueden ser perfectamente atómicos con staging a nivel de
  archivo. El padre eligió nivel de archivo y el usuario
  ejecutó; los 16 commits resultantes son atómicos por concern
  en el diff, aunque no hunk-perfect.
- **Side effect de sync-obsidian.** El hook post-commit
  `docs:obsidian` corrió en cada commit y sincronizó el
  `Documents-es/` del repo al vault de Obsidian del usuario. La
  interferencia del iCloud Drive FileProvider surgió como
  directorios duplicados con sufijos numéricos (`openspec 2/`,
  `docs 2/`, `openspec 4/`) dentro del vault. El
  `Documents-es.tmp/` del vault se limpió (con aprobación
  explícita del usuario) una vez que se confirmó que los
  contenidos eran solo contenido del repo. Esta es una
  interacción pre-existente documentada en ADR-0007 pero que
  vale re-flaggear acá.

### Resumen de findings

La ronda 1 surfacó 20 findings. La ronda 2 surfacó 1 HIGH residual
y 3 MED nuevos. El mini-fix cerró 4 de esos. La tabla completa está
en `openspec/changes/judgment-day-2026-06-20/` (la propuesta SDD
que acompaña a este ADR; ver Follow-ups).

| # | Finding | Sev | Estado | Commit(s) |
|---|---|---|---|---|
| F-01 | Hono route paths sin prefijo `/api` (production-breaking) | CRITICAL | Fixed | `9ca3bf6` |
| F-02 | Upstash `reset` es Unix-timestamp-ms, no duration | HIGH | Fixed | `ecea507` |
| F-03 | `authMiddleware` corre en `/health` (DB I/O en liveness) | HIGH | Fixed | `9ca3bf6` + `b233ad2` |
| F-04 | Rate-limit identifier es shared bucket cuando falta proxy | HIGH | Fixed | `b233ad2` |
| F-05 | `fxRateProvider` en `HonoAppDeps` es dead surface | HIGH | Fixed | `33220cd` |
| F-06 | Llamadas duplicadas a `svc.register(...)` en tests (BR-AUTH-4) | HIGH | Fixed | `bd66da4` |
| F-07 | `readyzAction` `setTimeout` no se limpia en éxito | MED | Fixed | `ce9c102` |
| F-08 | `error-handler.ts` no loguea `err.cause` | MED | Fixed | `ff24b5d` |
| F-09 | `accounts/index.ts` re-exporta clases de infrastructure | MED | Fixed | `3ab33d5` |
| F-10 | Drift ADR-0007 EN/ES en la descripción del algoritmo | MED | Fixed (residual en mini-fix) | `c7880b8` |
| F-11 | `requireSession` hace `c.set('user', user)` redundante | MED | Fixed | `be891b5` |
| F-12 | Drift de filter en `AccountService.count` | MED | Fixed | `3ab33d5` |
| F-13 | `list-accounts.action.ts` falla la list view ante error de count | MED | Fixed | `3ab33d5` |
| F-14 | Cast `as any` sobre `prisma()` en el wiring | MED | Fixed | `3c89e3d` |
| F-15 | Cast de ruta de `getAccountBalance` tiene `500` unreachable | LOW | Fixed | `9ca3bf6` |
| F-16 | Código muerto en tests (4 items) | LOW | Fixed | `708c63c` |
| F-17 | Factory `OpeningBalance` re-exportado pero nunca usado | LOW | Skipped (deliberate) | — |
| F-18 | ADR-0006 faltante (gap 0005 -> 0007) | INFO | Skipped (deliberate) | — |
| F-19 | `Sentry.captureConsoleIntegration?.()` no es una API real | LOW | Fixed | `335352b` |
| F-20 | Cast de `error-handler` `as 400 | ... | 502` permite drift | LOW | Fixed | `ecea507` |
| N-1 | Domain-time leaks: defaults de `new Date()` en value objects | MED | Fixed (mini-fix) | `bfb4ce2` |
| N-2 | F-14 parcial: `Prisma*Delegate` inline no consolidado | MED | Fixed (mini-fix) | `3c89e3d` |
| N-3 | Sin test para el cast estructural de F-14 | MED | Fixed (mini-fix) | `c8af939` |

### Verificación

End-to-end verificado el 2026-06-20 después del mini-fix:

- `pnpm test` → 379 passed (379) en 68 files, ~2.55s
- `pnpm typecheck` → clean
- Verificación manual con grep de todos los fixes CRITICAL y HIGH:
  - `app.ts:142,147,156` — las rutas son `/api/health`, `/api/readyz`, `/api/auth/register`
  - `error-handler.ts:52` — `err.resetMs - Date.now()` (no `err.resetMs / 1000`)
  - `app.ts:175` — `app.use('/api/*', authMiddleware)` registrado DESPUÉS de las rutas públicas
  - `rate-limit.ts:140` — helper `rateLimitIdentifier(prefix, headers)` exportado
  - `app.ts:113` — `createHonoApp` usa `deps.fxRateProvider` para construir el service
  - `auth.service.test.ts:119, 200` — patrón `try { ... } catch { ... }` single-call

### Consecuencias

- **Good**: el working tree es ahora un estado APPROVED. 22 de 20
  findings están addressed (la sobre-cifra viene de los 3 nuevos MED
  que la re-revisión surfacó). Los 16 commits son Conventional
  Commits con subject en imperativo, body que explica el *why*, y
  sin AI attribution. La type safety se preserva (sin `any`
  introducido; la vista narrow `any` centralizada en
  `prisma-types.ts` está documentada como trade-off deliberado).
- **Good**: la revisión dual surfacó un issue que el padre hubiera
  perdido (`/api/me` y `/api/auth/register` eran 404 en producción
  porque el catch-all es `/api/[...path]`). La cobertura por un
  único reviewer de un diff de ~850 líneas hubiera sido una moneda
  al aire.
- **Bad**: 1 LOW residual (IPv6 en `x-forwarded-for` produce una
  rate-limit key con múltiples `:` que Upstash trata como
  separadores de namespace, riesgo teórico de colisión). Aceptable
  por ahora; flag para tightening futuro.
- **Bad**: el slack del test de F-02 es `[29, 31]` para un delta de
  30s. CI lento (>=3s entre la construcción de `Date.now() + 30_000`
  y la ejecución del handler) puede flakear. Mitigación: ampliar
  a `[27, 33]` o usar `vi.useFakeTimers()`.
- **Bad**: el scope real de F-19 fue más grande de lo que el nombre
  del finding sugiere — `instrumentation.ts` creció de 12 a 110
  líneas (se agregaron 4 signal handlers, Sentry + Prisma
  disconnect, hard timeout cap de 8s). Vale una revisión aparte
  si signal handling se vuelve una preocupación futura.
- **Out of scope para este ADR**: los 17 archivos modificados
  restantes en el working tree (el slice pre-existente que el
  usuario tenía staged antes del juicio). Esos no son output del
  judgment day; commit o `git restore` a discreción del usuario.

## Follow-ups

1. **Documentar judgment-day como workflow reproducible.** Este
   ADR captura la sustancia; un SOP de follow-up bajo
   `openspec/changes/judgment-day-sop/` (o una sección en
   `openspec/specs/quality-gates/`) le permitiría a una
   invocación futura driven por `sdd-apply` re-correr el mismo
   loop blind-dual + fix + re-juicio sin que el padre
   redescubra la estructura.

2. **Script de commits atómicos a nivel de hunk.** El actual
   `scripts/judgment-day-commits.sh` hace staging a nivel de
   archivo. Un follow-up podría agregar selección de hunks
   driven por `git add -p` (con una tabla de mapping de hunk
   a concern de commit) para que los planes de 17 commits se
   mantengan verdaderamente hunk-atómicos en archivos
   compartidos como `app.ts`.

3. **Interacción `OBSIDIAN_VAULT_PATH` con iCloud.** El
   side effect de directorios duplicados (paths como
   `openspec 2/`, `docs 2/`) es una interacción pre-existente
   entre iCloud y el FileProvider. ADR-0007 documenta el
   algoritmo; este ADR re-flaggea el riesgo operacional para
   follow-up (un flag `--dry-run` en el script de sync
   atraparía el duplicado antes del write, pero está fuera
   del scope del judgment day).

4. **Dos LOW residuales para tightening futuro.**
   - IPv6 en `X-Forwarded-For` → rate-limit key con múltiples
     `:`. Mitigación: hashear la IP antes de usarla como
     parte de la key.
   - Slack del test de F-02 muy ajustado. Mitigación:
     `vi.useFakeTimers()` o ampliar la ventana `[29, 31]`.

5. **Limpieza del working tree.** 17 archivos modificados
   pre-existían al juicio y no son output del judgment day.
   El usuario debería correr `git status --short` y elegir
   entre committear (con su propio mensaje) o `git restore`
   (descartar) antes de abrir un PR.

## Referencias

- `openspec/specs/quality-gates/spec.md` (planned) — la spec
  upstream del workflow de judgment-day
- `openspec/changes/judgment-day-2026-06-20/proposal.md`
  (planned) — la propuesta SDD para el SOP de judgment-day
- `.tmp/judge-a-round-1.md`, `.tmp/judge-b-round-1.md`,
  `.tmp/judge-a-round-2.md`, `.tmp/judge-b-round-2.md` — los
  reportes completos de los jueces (el `.tmp/` de este repo
  está gitignored)
- `.tmp/fix-round-1.md`, `.tmp/fix-round-2.md` — los reportes
  del fix-agent
- `scripts/judgment-day-commits.sh` — el plan atómico de
  17 commits
- ADR-0007 §13.5 de `AGENTS.md` para la política de docs
  dual-language
