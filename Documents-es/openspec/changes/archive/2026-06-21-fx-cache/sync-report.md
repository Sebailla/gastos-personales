# Sync Report — `fx-cache` PR-3

**Autor**: Sebastián Illa
**Cambio**: `fx-cache`
**PR**: PR-3 de 3 PRs encadenados (final)
**Branch**: `feat/fx-cache-3` (desde `develop`)
**SHA base**: `273c191`
**Fecha**: 2026-06-22

> Documenta la promoción del spec desde
> `openspec/changes/fx-cache/specs/fx/spec.md` al canónico
> `openspec/specs/fx/spec.md`, la edición cross-link de una
> línea en `accounts/spec.md`, y el move a archive del folder
> del cambio. El mirror en español vive en
> `Documents-es/openspec/changes/fx-cache/sync-report.md`.

## 1. Promoción del spec

```bash
$ cp openspec/changes/fx-cache/specs/fx/spec.md openspec/specs/fx/spec.md
$ cp openspec/changes/fx-cache/specs/fx/spec.md \
      Documents-es/openspec/specs/fx/spec.md
```

El spec canónico de la capability `fx` (REQ-FX-1 a REQ-FX-9)
aterriza en `openspec/specs/fx/spec.md`. La fuente delta
bajo `openspec/changes/fx-cache/specs/fx/spec.md` queda sin
cambios; la copia canónica es byte-identical. El mirror en
español en `Documents-es/openspec/specs/fx/spec.md` también
es una copia byte-identical del spec canónico (per la regla
del proyecto "el mirror es una traducción fiel de la prosa,
verbatim de los code blocks e identifiers", root
`AGENTS.md` §13.4).

| Path                                              | Antes                            | Después                                                  |
| ------------------------------------------------- | -------------------------------- | -------------------------------------------------------- |
| `openspec/specs/fx/`                              | (no existe)                      | `spec.md` (canónico)                                      |
| `Documents-es/openspec/specs/fx/`                 | (no existe)                      | `spec.md` (mirror)                                         |
| `openspec/changes/fx-cache/specs/fx/spec.md`      | (fuente delta)                   | (fuente delta — sin cambios; archivado con el folder del cambio) |

La capability `fx` ahora es first-class en el árbol
canónico `openspec/specs/` (hermanos: `auth`, `accounts`,
`fx`). El próximo cambio que consuma la capability `fx`
referenciará `openspec/specs/fx/spec.md` directamente, sin
detour por el delta-spec.

## 2. Edición cross-link en `accounts/spec.md`

```bash
$ # Agregar un bullet a la sección "Cross-references" en
$ # openspec/specs/accounts/spec.md (y el mirror).
$ # El bullet referencia fx/spec.md y nota que el port
$ # FxRateProvider es consumido por accounts mientras que la
$ # implementación vive en fx.
```

El cross-link es el único cambio a la capability `accounts`
en PR-3. Sin cambio de comportamiento — la interfaz
`FxRateProvider`, el `FinancialAccountBalanceDto`, y el
contrato `BR-ACC-12` quedan sin cambios. El cross-link hace
explícita la dirección de dependencia a nivel del spec:

```markdown
## Cross-references

- [`fx/spec.md`](../fx/spec.md) — la interfaz
  `FxRateProvider` declarada en
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  es consumida por la capability `accounts` (vía la capa de
  action `get-account-balance.action.ts`). La implementación
  vive en la capability `fx` (ver `openspec/specs/fx/spec.md`
  REQ-FX-3). La dirección de dependencia es
  `accounts -> fx` sólo por el tipo casa lowercase; el
  módulo `accounts` NO importa desde `@/modules/fx` en
  runtime (regla modules-isolated, root `AGENTS.md` §10.5).
```

El mirror en español en
`Documents-es/openspec/specs/accounts/spec.md` recibe el
bullet equivalente en español (misma estructura, mismo
wording bajo la regla de traducción del proyecto).

## 3. Move a archive del folder del cambio

```bash
$ git mv openspec/changes/fx-cache \
        openspec/changes/archive/2026-06-21-fx-cache
$ git mv Documents-es/openspec/changes/fx-cache \
           Documents-es/openspec/changes/archive/2026-06-21-fx-cache
```

Después del move, el folder del cambio contiene 7 archivos
(la sección "Artifact layout" de `AGENTS.md` espera
exactamente 7 para un cambio cerrado):

```
openspec/changes/archive/2026-06-21-fx-cache/
├── proposal.md
├── design.md
├── tasks.md
├── apply-progress.md
├── verify-report.md
├── sync-report.md
└── specs/
    └── fx/
        └── spec.md
```

El mirror en español en
`Documents-es/openspec/changes/archive/2026-06-21-fx-cache/`
contiene los mismos 7 archivos (espejado).

## 4. Audit trail

El ADR en `docs/adr/0010-dolar-api-provider.md` (y su mirror
en español en `Documents-es/docs/adr/0010-dolar-api-provider.md`)
se escribió durante design time (2026-06-21). PR-3 verifica
que el ADR esté en disco; no se requiere ninguna edición
para la implementación en sí.

La proposal en `openspec/changes/fx-cache/proposal.md`
carga un campo "Status" que se volteará de `draft` a
`implemented` como parte de la metadata del archive-move.
(El flip se registra en el próximo commit, T3.10.)

## 5. CJK scan en mirrors

La regla §13.4 de AGENTS.md requiere un scan de caracteres
CJK en cada mirror en español para atrapar artifacts de la
herramienta de traducción. Los tres nuevos mirrors creados
por PR-3:

```
$ grep -P '[\x{4e00}-\x{9fff}]' \
    Documents-es/openspec/changes/fx-cache/apply-progress.md \
    Documents-es/openspec/changes/fx-cache/verify-report.md \
    Documents-es/openspec/changes/fx-cache/sync-report.md
$ # exit 0 (sin matches)
```

Y el cross-link + mirror del spec creado por PR-3:

```
$ grep -P '[\x{4e00}-\x{9fff}]' \
    Documents-es/openspec/specs/fx/spec.md \
    Documents-es/openspec/specs/accounts/spec.md
$ # exit 0 (sin matches)
```

## 6. Commit de entregable OpenSpec (T3.9)

Archivos hermanos en este commit:
- `openspec/changes/fx-cache/apply-progress.md` — ledger de
  commits de PR-3 + evidencia TDD + tabla de cobertura REQ.
- `openspec/changes/fx-cache/verify-report.md` — cobertura
  de los 9 REQ-FX-N con citaciones a tests en disco
  (review-facing).

La promoción real del spec + cross-link de accounts + move
a archive aterrizan en T3.10 (el próximo commit).
