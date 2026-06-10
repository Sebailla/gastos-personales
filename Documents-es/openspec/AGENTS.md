# Acuerdo de trabajo de OpenSpec — gastos-personales

Reglas específicas del proyecto para el flujo OpenSpec en este repo. Solo sobrescribe `~/.pi/agent/gentle-ai/support/sdd-status-contract.md` donde se indique explícitamente.

## Orden de resolución de status

1. Status provisto por el padre (sesión interactiva).
2. Este archivo.
3. Global `~/.pi/agent/gentle-ai/support/sdd-status-contract.md`.

## Layout de artefactos

```
openspec/
├── config.yaml                 # schema, capabilities, preflight
├── AGENTS.md                   # este archivo
├── changes/                    # cambios SDD activos
│   ├── <nombre-del-cambio>/
│   │   ├── proposal.md
│   │   ├── tasks.md
│   │   ├── design.md
│   │   ├── apply-progress.md
│   │   ├── verify-report.md
│   │   └── sync-report.md
│   └── archive/                # cambios cerrados
└── specs/                      # spec canónica por capability
    ├── auth/spec.md
    ├── accounts/spec.md
    ├── transactions/spec.md
    ├── fx/spec.md
    ├── snapshots/spec.md
    ├── reports/spec.md
    └── ui/spec.md
```

El espejo en español de cada archivo de este árbol vive en `Documents-es/openspec/...` con el mismo path relativo. Actualizá ambos en el mismo commit. Ver `AGENTS.md` raíz §13.

## Naming de cambios

`<alcance>-<slice>` en kebab-case. Ejemplos: `auth-foundation`, `accounts-ledger`, `fx-cache`, `networth-snapshot`. No usar el número de ticket de implementación.

## Dependencias

- `proposal` bloquea `spec`, `design`, `tasks`.
- `spec` + `design` bloquean `tasks`.
- `tasks` bloquea `apply`.
- `apply` bloquea `verify`.
- `verify` bloquea `sync`.
- `sync` bloquea `archive`.

Ver contrato global para el grafo completo de dependencias y la semántica de `applyState`.
