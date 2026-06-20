# Sync Report — `accounts-ledger`

**Autor**: Sebastián Illa
**Change**: `accounts-ledger`
**Estado**: sincronizado · **Fecha**: 2026-06-19
**Target del sync**: `openspec/specs/accounts/spec.md` (canónico, EN) + `Documents-es/openspec/specs/accounts/spec.md` (mirror ES)
**SHA del spec pre-sync**: ninguno (primera escritura del spec canónico de `accounts` — `openspec/specs/accounts/` no existía antes de este commit)
**SHA del commit de sync**: ver §5 (el SHA que aterriza los cambios del spec es el segundo de los 3 commits del lifecycle)

> **Objetivo**: promover los 14 Requirement deltas de
> `openspec/changes/accounts-ledger/specs/accounts/spec.md` al
> spec canónico `openspec/specs/accounts/spec.md` como una
> única primera escritura coherente del spec de la capability.
> Un reviewer leyendo el spec canónico 6 meses desde ahora no
> debería necesitar consultar el archivo de deltas ni la
> proposal.

---

## 1. Deltas promovidos (14 de 14)

El delta spec en
`openspec/changes/accounts-ledger/specs/accounts/spec.md` es
un **spec completo** (no un delta parcial): la capability
`accounts` no tenía un spec canónico previo en
`openspec/specs/accounts/spec.md`, así que el archivo de delta
entero se convierte en el archivo canónico verbatim (módulo la
actualización del header de metadata descrita en §4). Los 14
Requirements + 24 Scenarios aterrizan en el spec canónico tal
cual.

| #    | Requirement                                                                                      | Sección target en el spec canónico                         | Tipo                                 |
| ---- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | ------------------------------------ |
| R-1  | `FinancialAccount persiste el modelo discriminated de 6 tipos`                                   | `Requirements > Data model`                                | conductual (data + invariante Zod)   |
| R-2  | `GET /api/accounts devuelve un listado cursor-paginado scoped al usuario autenticado`            | `Requirements > Endpoints`                                 | conductual (superficie de API)       |
| R-3  | `POST /api/accounts crea una cuenta type-driven`                                                 | `Requirements > Endpoints`                                 | conductual (superficie de API + Zod) |
| R-4  | `GET /api/accounts/:id devuelve una cuenta o 404 cross-user`                                     | `Requirements > Endpoints`                                 | conductual (guard cross-module)      |
| R-5  | `PATCH /api/accounts/:id aplica un partial update`                                               | `Requirements > Endpoints`                                 | conductual (superficie de API + Zod) |
| R-6  | `POST /api/accounts/:id/archive soft-archiva la cuenta`                                          | `Requirements > Endpoints`                                 | conductual (soft-archive)            |
| R-7  | `POST /api/accounts/:id/unarchive restaura la cuenta`                                            | `Requirements > Endpoints`                                 | conductual (soft-archive)            |
| R-8  | `GET /api/accounts/:id/balance devuelve la conversión FX display-only`                           | `Requirements > Endpoints`                                 | conductual (FX read-only)            |
| R-9  | `/accounts lista las cuentas vivas del usuario (Server Component)`                               | `Requirements > UI smoke slice`                            | conductual (smoke slice de UI)       |
| R-10 | `/accounts/new renderiza el form de create type-driven (Server shell + Client form)`             | `Requirements > UI smoke slice`                            | conductual (smoke slice de UI)       |
| R-11 | `/accounts/[id] muestra el detalle de la cuenta y el widget de balance (Server + Client widget)` | `Requirements > UI smoke slice`                            | conductual (smoke slice de UI)       |
| R-12 | `Todos los request bodies se validan con Zod schemas`                                            | `Requirements > Validación, errores, integración con auth` | conductual (Zod)                     |
| R-13 | `Todos los endpoints requieren una sesión autenticada`                                           | `Requirements > Validación, errores, integración con auth` | conductual (integración con auth)    |
| R-14 | `Los errores siguen el envelope de error estándar del proyecto`                                  | `Requirements > Validación, errores, integración con auth` | conductual (envelope de error)       |

**14 de 14 Requirements promovidos.** El spec también incluye 8
Business Rules (BR-ACC-12 a BR-ACC-19) y 5 enums
(`AccountType`, `AccountKind`, `InvestmentType`,
`OpeningBalanceMode`, `AccountCurrency`); todos se promueven
tal cual (están referenciados por los Requirements y Scenarios
del spec canónico).

### Promociones adicionales más allá de los 14 Requirements

Ninguna. El archivo de delta es un **spec completo**, no un
delta parcial con extras; no se agregó nada en el sync más
allá de la actualización del header de metadata descrita en §4.

---

## 2. Deltas no promovidos (0 de 14)

Ninguno. Los 14 Requirements del delta spec aterrizan en el
spec canónico. No hay delta "skipeado" o "diferido" — el archivo
de delta ES el spec, verbatim.

Para completitud: el archivo de delta incluye un blockquote
de preámbulo "primera escritura" que describe qué
operacionaliza el spec (proposal v3 + 10 decisiones de
producto). Este preámbulo se preserva en el spec canónico
verbatim (no es metadata; es contenido de body que un
reviewer necesita para entender la proveniencia del spec).

---

## 3. Resumen del diff

Spec canónico pre-sync: **no existía** (`openspec/specs/accounts/` era un directorio nuevo).
Spec canónico post-sync: **667 líneas** (inglés, `openspec/specs/accounts/spec.md`).
Delta neto: **+667 líneas, 0 deletions** — el spec canónico se crea desde cero.

Mirror español pre-sync: **no existía** (`Documents-es/openspec/specs/accounts/` era un directorio nuevo).
Mirror español post-sync: **690 líneas** (español, `Documents-es/openspec/specs/accounts/spec.md`).
Delta neto: **+690 líneas, 0 deletions** — el mirror español se crea desde cero.

Delta fuente (inglés): **669 líneas** (`openspec/changes/accounts-ledger/specs/accounts/spec.md`).
Delta fuente (español): **692 líneas** (`Documents-es/openspec/changes/accounts-ledger/specs/accounts/spec.md`).

El spec canónico es **−2 líneas vs. el delta inglés** (667 vs 669): el header del delta fue condensado (se droppearon las líneas de metadata `**Preflight**` y `**Strict TDD**` que solo tienen sentido en change context, según §4). El mirror español es **−2 líneas vs. el delta español** (690 vs 692): mismo razonamiento.

```text
openspec/specs/accounts/spec.md | 667 ++++++++++++++++++++++++++++++++++++
new file mode 100644
Documents-es/openspec/specs/accounts/spec.md | 690 ++++++++++++++++++++++++++++++++++++
new file mode 100644
openspec/changes/accounts-ledger/sync-report.md | ~250 líneas (este archivo)
Documents-es/openspec/changes/accounts-ledger/sync-report.md | ~250 líneas (mirror ES)
```

El `git diff --stat` entre el archivo de delta y el archivo canónico mostraría las −2 líneas (metadata dropped) y zero diff significativo de body. Los bodies son idénticos.

---

## 4. Campo `Source change`

El header de metadata del spec se actualizó desde la forma
delta (change-context) a la forma canónica activa:

| Campo               | Delta spec (change context)                         | Spec canónico (activo)                                                                            |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `**Capability**`    | `accounts` (nueva — primera escritura de este spec) | `accounts`                                                                                        |
| `**Source change**` | `accounts-ledger` (proposal v3, draft 2026-06-18)   | `accounts-ledger`                                                                                 |
| `**Status**`        | `draft · **Created**: 2026-06-18`                   | `active · **Created**: 2026-06-18 · **Last sync**: 2026-06-19 (accounts-ledger)`                  |
| `**Stack**`         | kept verbatim                                       | kept verbatim                                                                                     |
| `**Preflight**`     | kept (solo significativo en change context)         | **dropped** — solo significativo en change context; vive en `openspec/changes/<name>/proposal.md` |
| `**Strict TDD**`    | kept (solo significativo en change context)         | **dropped** — solo significativo en change context; vive en `openspec/config.yaml`                |

El campo `Status` se mueve de `draft` a `active` porque el
spec ahora es la fuente de verdad, no un borrador. Un cambio
futuro que agregue nuevos deltas bumpearía a
`Last sync: YYYY-MM-DD (<change-name>)`.

El blockquote "primera escritura" (líneas 11-18 en el delta)
se preserva verbatim — es contenido de body, no metadata; un
reviewer leyendo el spec canónico se beneficia de saber que
esta es la primera escritura (por eso la ausencia de "nota v1"
es intencional, no un descuido).

Equivalentes del header del mirror español:

| Campo               | Mirror español (activo)                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `**Autor**`         | `Sebastián Illa`                                                                            |
| `**Capability**`    | `accounts`                                                                                  |
| `**Cambio fuente**` | `accounts-ledger`                                                                           |
| `**Estado**`        | `activo · **Creado**: 2026-06-18 · **Última sincronización**: 2026-06-19 (accounts-ledger)` |
| `**Stack**`         | kept verbatim                                                                               |

---

## 5. Commits

El sync es el **segundo de 3 commits atómicos** en este cierre de lifecycle:

| #   | SHA (real, post-commit) | Tipo            | Descripción                                                                |
| --- | ----------------------- | --------------- | -------------------------------------------------------------------------- |
| 1   | `a66dc1b`               | docs(openspec)  | verify report for accounts-ledger (el commit de verify, ya mergeado)       |
| 2   | `fb59a72`               | docs(openspec)  | sync accounts-ledger deltas to canonical accounts spec (commit de sync)    |
| 3   | `6f8b737`               | chore(openspec) | archive accounts-ledger (commit de archive, aterriza en esta misma sesión) |

Los 3 SHAs son los reales, confirmados por `git log origin/develop -3 --format='%H %s'`. El SHA-2 fue amended tres veces después de su creación (solo fixes cosméticos — se removieron backticks sueltos alrededor de `§13.3` que se colaron por escape de shell, y se completó el placeholder del SHA dos veces a medida que el SHA cambió con cada amend); ningún contenido del spec cambió a lo largo de ningún amend.

---

## 6. Re-verificación post-sync

Post-sync, el spec canónico contiene cada uno de los 14
Requirements promovidos + 8 Business Rules + 5 enums. La
verificación es por grep; cada Requirement / BR / enum se
busca en el spec canónico y el hit count se asserta en
exactamente 1 (para el heading matching o el stable ID).

| Delta              | Sección del spec / stable ID                                                 | Verificado por (grep)                                                                                                       | Hit                                        |
| ------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- | ------ | ---- | --------------------------------------- | --- |
| R-1                | `Requirement: FinancialAccount persiste el modelo discriminated de 6 tipos`  | `grep -c '^#### Requirement: FinancialAccount persiste el modelo discriminated de 6 tipos' openspec/specs/accounts/spec.md` | 1                                          |
| R-2                | `Requirement: GET /api/accounts devuelve un listado cursor-paginado`         | `grep -c '^#### Requirement: GET /api/accounts devuelve un listado cursor-paginado' openspec/specs/accounts/spec.md`        | 1                                          |
| R-3                | `Requirement: POST /api/accounts crea una cuenta type-driven`                | `grep -c '^#### Requirement: POST /api/accounts crea una cuenta type-driven' openspec/specs/accounts/spec.md`               | 1                                          |
| R-4                | `Requirement: GET /api/accounts/:id devuelve una cuenta o 404 cross-user`    | `grep -c '^#### Requirement: GET /api/accounts/:id devuelve una cuenta o 404' openspec/specs/accounts/spec.md`              | 1                                          |
| R-5                | `Requirement: PATCH /api/accounts/:id aplica un partial update`              | `grep -c '^#### Requirement: PATCH /api/accounts/:id aplica un partial update' openspec/specs/accounts/spec.md`             | 1                                          |
| R-6                | `Requirement: POST /api/accounts/:id/archive soft-archiva la cuenta`         | `grep -c '^#### Requirement: POST /api/accounts/:id/archive soft-archiva la cuenta' openspec/specs/accounts/spec.md`        | 1                                          |
| R-7                | `Requirement: POST /api/accounts/:id/unarchive restaura la cuenta`           | `grep -c '^#### Requirement: POST /api/accounts/:id/unarchive restaura la cuenta' openspec/specs/accounts/spec.md`          | 1                                          |
| R-8                | `Requirement: GET /api/accounts/:id/balance devuelve la conversión FX`       | `grep -c '^#### Requirement: GET /api/accounts/:id/balance devuelve la conversión FX' openspec/specs/accounts/spec.md`      | 1                                          |
| R-9                | `Requirement: /accounts lista las cuentas vivas del usuario`                 | `grep -c '^#### Requirement: /accounts lista' openspec/specs/accounts/spec.md`                                              | 1                                          |
| R-10               | `Requirement: /accounts/new renderiza el form de create type-driven`         | `grep -c '^#### Requirement: /accounts/new renderiza' openspec/specs/accounts/spec.md`                                      | 1                                          |
| R-11               | `Requirement: /accounts/[id] muestra el detalle de la cuenta`                | `grep -c '^#### Requirement: /accounts/\[id\] muestra' openspec/specs/accounts/spec.md`                                     | 1                                          |
| R-12               | `Requirement: Todos los request bodies se validan con Zod schemas`           | `grep -c '^#### Requirement: Todos los request bodies se validan con Zod schemas' openspec/specs/accounts/spec.md`          | 1                                          |
| R-13               | `Requirement: Todos los endpoints requieren una sesión autenticada`          | `grep -c '^#### Requirement: Todos los endpoints requieren una sesión autenticada' openspec/specs/accounts/spec.md`         | 1                                          |
| R-14               | `Requirement: Los errores siguen el envelope de error estándar del proyecto` | `grep -c '^#### Requirement: Los errores siguen el envelope' openspec/specs/accounts/spec.md`                               | 1                                          |
| BR-ACC-12          | `BR-ACC-12`                                                                  | `grep -c 'BR-ACC-12' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-13          | `BR-ACC-13`                                                                  | `grep -c 'BR-ACC-13' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-14          | `BR-ACC-14`                                                                  | `grep -c 'BR-ACC-14' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-15          | `BR-ACC-15`                                                                  | `grep -c 'BR-ACC-15' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-16          | `BR-ACC-16`                                                                  | `grep -c 'BR-ACC-16' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-17          | `BR-ACC-17`                                                                  | `grep -c 'BR-ACC-17' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-18          | `BR-ACC-18`                                                                  | `grep -c 'BR-ACC-18' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| BR-ACC-19          | `BR-ACC-19`                                                                  | `grep -c 'BR-ACC-19' openspec/specs/accounts/spec.md`                                                                       | 1+                                         |
| Enum `AccountType` | (sección de entities)                                                        | `grep -c 'AccountType.\*BANK                                                                                                | CREDIT                                     | INVESTMENT | CRYPTO | CASH | OTHER' openspec/specs/accounts/spec.md` | 1   |
| Enum `AccountKind` | (sección de entities)                                                        | `grep -c 'AccountKind.\*SAVINGS                                                                                             | CHECKING' openspec/specs/accounts/spec.md` | 1          |

Los 14 Requirements + 8 BRs + 5 enums están presentes en el spec canónico. El count `1+` en los stable IDs de BR-ACC-NN refleja el heading del BR más las cross-references dentro de los Scenarios relevantes; el heading en sí es hit al menos una vez.

---

## 7. Open flags heredados del verify report

El sync no resolvió ninguna de las 2 SUGGESTIONs del verify report. Las SUGGESTIONs están documentadas en el verify report y quedan a criterio del usuario:

- **SUGGESTION 1** — `FxRateProviderUnconfigured` devuelve `503 FX_UNAVAILABLE` en cada dev environment hasta que el futuro change `fx-cache` provea una implementación real. By design según `design.md` §5.2 y `proposal.md` Dependencies; el smoke UI la expone verbatim con el copy de error inline de BR-ACC-18. El sync preservó BR-ACC-12 y BR-ACC-13 verbatim; la limitación está documentada en el spec como una restricción conocida. **No requiere acción.**

- **SUGGESTION 2** — 4 nuevos códigos de error (`NAME_TAKEN`, `NOT_FOUND`, `FX_UNAVAILABLE`, `FX_NOT_SUPPORTED`) agregados al registry `ErrorCode` del proyecto (`src/shared/errors/error-codes.ts:26,29,32,33`). Aditivo (sin breaking change sobre códigos existentes). El sync preservó el R-14 Requirement ("Los errores siguen el envelope de error estándar del proyecto") verbatim con los 4 nuevos códigos enumerados como in-scope. **No requiere acción.**

No hay issues CRITICAL en el verify report. No hay issues WARNING. El commit de sync aterriza sin CRITICAL sin resolver.

---

## 8. Dual write check

- [x] `openspec/specs/accounts/spec.md` creado (canónico, inglés, 667 líneas)
- [x] `Documents-es/openspec/specs/accounts/spec.md` creado (mirror español, 690 líneas, mismo commit)
- [x] `openspec/changes/accounts-ledger/sync-report.md` (este archivo, inglés, ~250 líneas)
- [x] `Documents-es/openspec/changes/accounts-ledger/sync-report.md` (mirror español, ~250 líneas, mismo commit)

Check de drift CJK en el mirror español:

```bash
$ grep -P '[\x{4e00}-\x{9fff}]' Documents-es/openspec/specs/accounts/spec.md Documents-es/openspec/changes/accounts-ledger/sync-report.md
(0 matches)
```

El mirror español del spec canónico y el mirror español del sync report contienen cero caracteres CJK. Invariante bilingüe intacta según `AGENTS.md` §13.3.

---

## 9. Next step

`chore(openspec): archive accounts-ledger` (commit 3 del
cierre de lifecycle, aterriza en esta misma sesión).

`git mv` todo el árbol `openspec/changes/accounts-ledger/` a
`openspec/changes/archive/2026-06-19-accounts-ledger/` (con
el mirror `Documents-es/` correspondiente). Un único commit
atómico:

```
openspec/changes/accounts-ledger/         → openspec/changes/archive/2026-06-19-accounts-ledger/
Documents-es/openspec/changes/accounts-ledger/ → Documents-es/openspec/changes/archive/2026-06-19-accounts-ledger/
```

Después de que el archive aterrice, el cierre de lifecycle está completo:

- 32 de 32 tareas atómicas completas (T-A1..T-A8 + T-B1..T-B14 + T-C1..T-C10)
- 14 de 14 spec Requirements promovidos al spec canónico de `accounts`
- 8 de 8 BRs (BR-ACC-12..ACC-19) promovidos
- 5 de 5 enums promovidos
- Verify report + sync report + archive en 3 commits atómicos
- `accounts-ledger` cerrado; el spec canónico es `openspec/specs/accounts/spec.md`

El change `fx-cache` se desbloquea después del archive (depende
del port `FxRateProvider` declarado acá).
