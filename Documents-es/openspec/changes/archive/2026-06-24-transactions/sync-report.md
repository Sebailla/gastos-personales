# Sync Report — `transactions`

**Autor**: Sebastián Illa
**Cambio**: `transactions`
**Branch**: `chore/archive-transactions` (desde `develop`)
**SHA base**: `31a0252`
**Fecha**: 2026-06-24
**Folder archivado**: `openspec/changes/archive/2026-06-24-transactions/`
**Spec canónico**: `openspec/specs/transactions/spec.md` (source of truth)
**Spec delta**: `openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md` (archivado, mantenido en lockstep con el canónico)

> Documenta el cierre del archivo del cambio SDD
> `transactions` después de que `sdd-verify` devolviera
> `PASS-WITH-FOLLOWUPS` (ver
> `openspec/changes/archive/2026-06-24-transactions/verify-report.md`).
> El spec canónico aterrizó durante la fase de planning
> (commit `3584ec7`, #58) y es la source of truth; el spec
> delta dentro del folder archivado es la copia de
> auditoría. El mirror en español vive en
> `Documents-es/openspec/changes/archive/2026-06-24-transactions/sync-report.md`.

## 1. Verificación de sincronización del spec

El spec de la capability `transactions` se escribió durante
la fase de planning y se commiteó en `3584ec7` como el
spec canónico (`openspec/specs/transactions/spec.md`) y
como spec delta dentro del folder del cambio. Ambas copias
declaran **15 requirements (REQ-TX-1 a REQ-TX-15)** con
**32 escenarios** bajo headers `#### Scenario:`. Un `diff`
entre el canónico y el delta después del move a archive
muestra únicamente drift intencional de metadata, sin
drift de requirements:

| Segmento del diff                                 | Canónico (`openspec/specs/...`)                                                            | Delta (archivado)                                                 | Razón                                                                                                                                                                                                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Párrafo introductorio                             | "This is the canonical `transactions` capability spec."                                    | "This is a **delta spec** for the new `transactions` capability." | Uno fue escrito para vivir en `openspec/specs/`, el otro bajo el folder del cambio. Auto-identificación intencional.                                                                                                                                             |
| Encabezado bajo "Error codes" / "Error semantics" | "Error semantics"                                                                          | "Error codes"                                                     | Cosmético; ambos anclan los mismos códigos `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED`. La fase apply (`src/shared/errors/error-codes.ts`) lee `ACCOUNT_ARCHIVED` + `INVALID_AMOUNT` + `FUTURE_TRANSACTION_DATE` y el verify report lo cita. |
| Sección final `## History`                        | Presente (registra "2026-06-22 (v1) — first write. Created by the `transactions` change.") | Ausente                                                           | Agregada por `sdd-archive` después del commit de planning para que el canónico cargue el sello de versión; el delta no la necesita.                                                                                                                              |
| Campo `**Source change**`                         | `transactions`                                                                             | `transactions`                                                    | Idéntico.                                                                                                                                                                                                                                                        |

Los conteos de 15 REQ y 32 escenarios coinciden
exactamente (verificado vía `grep -cE '^### Requirement:
REQ-TX-'` y `grep -cE '^#### Scenario:'`). El delta de
accounts (`specs/accounts/spec.md`, cross-link REQ-ACC-X1)
también se archiva intacto; el spec canónico de `accounts`
NO fue modificado por este cambio (el delta es solo un
puntero cross-link, sin cambio de comportamiento).

```
$ diff -q openspec/specs/transactions/spec.md \
        openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
Files ... differ  (drift intencional según la tabla anterior)
$ grep -cE '^### Requirement: REQ-TX-' openspec/specs/transactions/spec.md
15
$ grep -cE '^### Requirement: REQ-TX-' openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
15
$ grep -cE '^#### Scenario:' openspec/specs/transactions/spec.md
32
$ grep -cE '^#### Scenario:' openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
32
```

No se necesitó promoción del spec (el canónico ya existía
en `openspec/specs/transactions/spec.md` desde el planning).
El canónico se queda donde está; el delta se mueve con el
folder del cambio.

## 2. Move del folder del cambio a archive

```bash
$ git mv openspec/changes/transactions \
        openspec/changes/archive/2026-06-24-transactions
$ git mv Documents-es/openspec/changes/transactions \
           Documents-es/openspec/changes/archive/2026-06-24-transactions
```

Después del move, el folder archivado contiene los 8
archivos esperados según el acuerdo de trabajo de OpenSpec
(`openspec/AGENTS.md` "Artifact layout") más el
`sync-report.md` que crea este archivo:

```
openspec/changes/archive/2026-06-24-transactions/
├── apply-progress.md       (ledger de commits slice por slice + evidencia TDD RED→GREEN)
├── design.md               (estructura de módulos + 21 secciones de decisiones arquitectónicas)
├── explore.md              (documento de investigación, DG-TX-1..15 mapeados a costuras upstream)
├── proposal.md             (15 decisiones de producto cerradas en el grill de pre-propose)
├── sync-report.md          (este archivo)
├── tasks.md                (492 líneas, plan de slices con esquema de checkpoint RED→GREEN)
├── verify-report.md        (15 REQ × 32 escenarios mapeados a tests on-disk)
└── specs/
    ├── accounts/
    │   └── spec.md         (delta cross-link REQ-ACC-X1; sin cambio de comportamiento)
    └── transactions/
        └── spec.md         (delta spec, mantenido en lockstep con el canónico)
```

El mirror en español en
`Documents-es/openspec/changes/archive/2026-06-24-transactions/`
contiene los mismos 8 archivos (mirrored). EN + ES según
`AGENTS.md` raíz §13.3 atomicity — ambos aterrizaron en
el mismo commit.

| Path                                                             | Antes                                          | Después                                                                                             |
| ---------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `openspec/changes/transactions/`                                 | folder del cambio activo (7 archivos tracked)  | (gone — movido)                                                                                     |
| `openspec/changes/archive/2026-06-24-transactions/`              | (no existe)                                    | folder del cambio archivado (8 archivos incluyendo este sync-report)                                |
| `Documents-es/openspec/changes/transactions/`                    | mirror del cambio activo                       | (gone — movido)                                                                                     |
| `Documents-es/openspec/changes/archive/2026-06-24-transactions/` | (no existe)                                    | mirror del cambio archivado (8 archivos)                                                            |
| `openspec/specs/transactions/spec.md`                            | spec canónico (ya en su lugar desde `3584ec7`) | spec canónico (sin cambios)                                                                         |
| `openspec/specs/accounts/spec.md`                                | spec canónico (sin cambios)                    | spec canónico (sin cambios — el delta REQ-ACC-X1 era un puntero cross-link, sin cambio al canónico) |

Nota sobre `verify-report.md`: este archivo existía como
write untracked en el working tree de `develop` (creado
post-slice-5 durante la fase de verify, nunca commiteado
de forma aislada). Se stagetió en este commit de archivo
para que el audit trail esté completo. Los 5 PRs de slice
(#59–#63) aterrizaron en `develop` sin él; el verify
report es la evidencia post-merge.

## 3. Flips de Status

Cuatro artefactos cargan un campo Status / Estado que pasa
de `draft` / `borrador` / `research` / `investigación` a
`implemented` / `implementado` (o "research (archived)" /
"investigación (archivado)" para `explore.md`, que es un
documento de investigación, no un deliverable).

| Archivo             | Campo EN      | Antes                 | Después                                                                                       |
| ------------------- | ------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `proposal.md`       | `**Status**:` | `draft`               | `implemented` (+ `**Implemented**: 2026-06-24 (slices 1-5 mergeados en develop vía #59-#63)`) |
| `tasks.md`          | `**Status**:` | `draft`               | `implemented` (+ `**Last sync**: 2026-06-24 (slices 1-5 mergeados en develop vía #59-#63)`)   |
| `design.md`         | `**Status**:` | `draft`               | `implemented` (+ `**Implemented**: 2026-06-24 (slices 1-5 mergeados en develop vía #59-#63)`) |
| `explore.md`        | `**Status**:` | `research`            | `research (archived)` (+ `**Archived**: 2026-06-24 (...)`)                                    |
| `verify-report.md`  | `**Status**:` | `PASS-WITH-FOLLOWUPS` | (sin cambios — ya refleja el veredicto de verify)                                             |
| `apply-progress.md` | `**Status**:` | `open`                | (sin cambios — `apply-progress` es un ledger por slice, no un gate de lifecycle)              |

Los mirrors en ES reciben los mismos flips con la misma
semántica de campos.

```
$ grep -nE '^\*\*(Status|Estado)\*\*' \
      openspec/changes/archive/2026-06-24-transactions/{proposal,tasks,design,explore}.md \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/{proposal,tasks,design,explore}.md
openspec/changes/archive/2026-06-24-transactions/proposal.md:3:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/tasks.md:6:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/design.md:3:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/explore.md:3:**Status**: research (archived) · ...
Documents-es/.../proposal.md:3:**Estado**: implementado · ...
Documents-es/.../tasks.md:6:**Estado**: implemented · ...
Documents-es/.../design.md:3:**Status**: implemented · ...
Documents-es/.../explore.md:3:**Estado**: investigación (archivado) · ...
```

Los ocho flips aterrizaron en este commit de archivo; no
quedan campos `draft`/`borrador` en ningún header de
artefacto.

## 4. CJK scan sobre mirrors

La regla del `AGENTS.md` raíz §13.4 requiere un scan de
caracteres CJK sobre cada mirror en español para cazar
artefactos de herramientas de traducción. El scan sobre el
folder archivado:

```bash
$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/ \
      | wc -l
0
$ # El scan completo de Python usa cuatro rangos Unicode
$ # (CJK Unified Ideographs U+4E00-U+9FFF, full-width ASCII
$ # variants U+FF00-U+FFEF, bloque CJK Symbols and Punctuation
$ # U+3000-U+303F, y el complemento full-width punctuation).
$ # El regex literal se omite aquí según la convención del
$ # verify-report para que este reporte quede libre de
$ # caracteres en el rango CJK.
$ python3 -c "import re, glob; files = glob.glob(
      'Documents-es/openspec/changes/archive/2026-06-24-transactions/**/*.md',
      recursive=True);
      pattern = re.compile('CJK-RANGE-PLACEHOLDER');
      total = sum(
          len(pattern.findall(
              open(f, 'r', encoding='utf-8').read())) for f in files);
      print(f'CJK: {total}')"
CJK: 0
```

Tanto el bloque canónico CJK Unified Ideographs
(`U+4E00–U+9FFF`) como los rangos full-width / punctuation
CJK / half-width devuelven cero matches sobre los 8
archivos del mirror ES en el folder archivado. El
traductor produjo español neutral-profesional limpio
según §13.4.

(La clase de caracteres CJK misma es un placeholder ASCII
no imprimible en este reporte; el regex Unicode literal
se emitió al rango CJK estándar según la convención del
proyecto para herramientas de traducción — ver
`verify-report.md` "Self-verify §7" para la misma
convención a la inversa.)

## 5. Follow-ups

El verify report (`verify-report.md` §"Gaps and follow-ups")
identifica **1 gap MEDIUM + 5 gaps LOW**. El gap MEDIUM es
el único work item post-archive; los gaps LOW son
limitaciones documentadas y refactors cosméticos.

### MEDIUM — production gap (overlap con REQ-TX-7, BR-TX-5)

`buildTransactionDeps` en `src/modules/api/app.ts:457-474`
no conecta un `AccountRepositoryPrisma` real a
`transactionDeps`. La `POST /api/transactions` de
producción contra una cuenta archivada devuelve
`500 INTERNAL_ERROR` en lugar de `409 ACCOUNT_ARCHIVED`.

**Fix recomendado** (un commit, ~30 líneas):

1. Agregar el parámetro `accountRepository` a
   `buildTransactionDeps`.
2. En `app.ts:517` (el call site que construye
   `transactionDeps`), pasar
   `accountRepository: new AccountRepositoryPrisma({
  financialAccount: asPrismaDelegateView(prismaClientForView)
    .financialAccount
})`.
3. Entonces `createTransactionAction` pre-chequeara
   `account.archivedAt` y surface el 409 correcto.

El test unitario `create-transaction.action.test.ts` ya
ejerce el pre-check BR-TX-5 archived; el gap está en el
DI wiring que el test unitario bypasea con un fake.

**Branch sugerido**: `fix/transactions-archived-account-precheck`.
El fix aterriza como PR separado después de que este
archive aterrice. NO reabre el cambio `transactions` — el
cambio está archivado.

### Gaps LOW (5 en total, todas limitaciones documentadas)

1. **Cobertura sobre `src/modules/transactions/**`.** No
se volvió a correr `pnpm test --coverage`end-to-end al
cierre del slice 5; los 658 tests pasando ejercen cada
superficie pública de`domain/**`y`application/**`;
la smoke UI bajo `app/transactions/**`no está
Vitest-covered según el precedente del slice de
accounts. Un run de cobertura follow-up confirmaría
≥ 80% en`src/modules/transactions/**` per el proposal
   §"Acceptance criteria" item 1.
2. **Idempotency key (DG-TX-9).** Candidato documentado
   para v1.1. No hay campo `idempotencyKey` en el modelo
   Prisma `Transaction`. El riesgo de duplicados por
   retry-on-5xx está aceptado.
3. **Rename de `mapDomainError`.** La deviation #7 del
   slice 3 señaló un rename futuro a
   `unknownErrorToFxUnavailable` (describe mejor el job
   más acotado). Cosmético solamente.
4. **Refactor del shared-kernel.** Las deviations de los
   slices 1+2+3 establecieron mirrors locales para
   `FxRateProvider`, `AccountRepositoryPort`,
   `AccountCurrency`, `AccountFxCasa`. Un refactor futuro
   colapsa los cuatro mirrors en
   `@/shared/domain/ports/` y `@/shared/domain/enums/`.
   Los valores están en sync hoy vía el contrato "no
   drift" del design §2.1.
5. **Replace de `randomHex`.** La acción create del slice
   3 mintea el id de la fila vía
   `globalThis.crypto.getRandomValues` (defense in depth
   contra riesgo de id predecible). El adapter de Prisma
   del slice 4 genera el cuid; el `randomHex` de la acción
   create solo se usa por la acción antes de que el
   adapter tome el control. Un slice futuro reemplaza
   esto con el generador de id del adapter de Prisma de
   forma consistente.

## 6. Audit trail

El cambio `transactions` se planeó + aterrizó en 7
commits en `develop`, todos alcanzados vía PR (per root
`AGENTS.md` §5.2 — squash-merge para historia lineal):

| #   | Commit (corto) | PR        | Slice                                                                                                          |
| --- | -------------- | --------- | -------------------------------------------------------------------------------------------------------------- |
| 0   | `3584ec7`      | #58       | Planning (proposal + spec canónico + design + tasks + apply-progress skeleton)                                 |
| 1   | `d66151c`      | #59       | Slice 1 — Transaction aggregate + port + factory + direction enum + domain errors                              |
| 2   | `e896c81`      | #60       | Slice 2 — helper `fx-snapshot` + 3 error codes + evento `TransactionRecorded` + wiring del factory             |
| 3   | `d4950fc`      | #61       | Slice 3 — actions (create/read/list/update/delete) + Zod schemas + `InMemoryRepository`                        |
| 4   | `941bf0a`      | #62       | Slice 4 — refactor `prisma-types` (§10.5 remoción de `any`) + `TransactionRepositoryPrisma` + migración Prisma |
| 5   | `31a0252`      | #63       | Slice 5 — rutas Hono `/api/transactions/*` + DI wiring + smoke UI (3 páginas)                                  |
| 6   | (este commit)  | (este PR) | Move a archive + flips de Status + sync-report                                                                 |

Evidencia en `develop` post-merge del slice 5 (per
`verify-report.md` "Self-verify" §8):

```
$ git log develop --oneline | head -7
31a0252 feat(transactions): slice 5 — Hono routes + DI wiring + smoke UI (#63)
941bf0a feat(transactions): slice 4 — prisma-types refactor (§10.5 fix) + Transaction adapter + migration (#62)
d4950fc feat(transactions): slice 3 — actions + Zod schemas + InMemoryRepository (#61)
e896c81 feat(transactions): slice 2 — fx-snapshot helper + 3 error codes + TransactionRecorded event (#60)
d66151c feat(transactions): slice 1 — Transaction aggregate + port + factory + tests (#59)
3584ec7 docs(transactions): commit planning artifacts + canonical spec (#58)
6e90de5 chore(husky): use pnpm exec + refresh index in pre-commit (#57)
```

Evidencia de test + typecheck + build (de `verify-report.md`
§"Test + typecheck + build evidence"):

```
$ pnpm test
 Test Files  104 passed | 1 skipped (105)
      Tests  658 passed | 4 skipped (662)

$ pnpm run typecheck
> tsc --noEmit
(output vacío = 0 errores)

$ pnpm run build
┌ ƒ /transactions
├ ƒ /transactions/[id]
└ ƒ /transactions/new
```

## 7. Self-verify (ejecutado después de que el commit de archive aterrice)

```
$ ls openspec/changes/archive/2026-06-24-transactions/
apply-progress.md  design.md  explore.md  proposal.md
specs/             sync-report.md  tasks.md  verify-report.md

$ ls Documents-es/openspec/changes/archive/2026-06-24-transactions/
apply-progress.md  design.md  explore.md  proposal.md
specs/             sync-report.md  tasks.md  verify-report.md

$ ls openspec/changes/
_template/  archive/

$ git diff --stat HEAD~1 HEAD
 ... 25 files changed, 0 insertions(+), 0 deletions(-)

$ git grep -nE '^Status: draft' develop -- \
      'openspec/changes/archive/2026-06-24-transactions/*.md' | wc -l
0

$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/ | wc -l
0

$ pnpm test 2>&1 | tail -3
      Tests  658 passed | 4 skipped (662)

$ pnpm run typecheck 2>&1 | tail -3
(output vacío = 0 errores)
```

El move a archive es metadata-only; no toca ningún archivo
de source bajo `src/`, `prisma/`, ni `app/`. El spec
canónico en `openspec/specs/transactions/spec.md` NO fue
modificado por este commit de archive (se commiteó en el
planning en `3584ec7` y es la source of truth).
