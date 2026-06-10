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

## Atribución de autor (metadata de docs)

**El autor de todo documento en este proyecto es `Sebastián Illa`. Sin excepciones, sin atribución de IA, sin nombres de agentes, sin formas "co-authored".**

Aplica a los campos de header `**Author**:` (inglés) y `**Autor**:` (español) de cada artefacto Markdown creado en el repo:

- `openspec/changes/<nombre>/{proposal,design,tasks,apply-progress,verify-report,sync-report}.md`
- `openspec/specs/<capability>/spec.md`
- `docs/architecture.md`, `docs/adr/*`, `README.md`, `CHANGELOG.md`, runbooks
- Cada espejo en español bajo `Documents-es/...`

**Formas prohibidas** (serán rechazadas por el reviewer y corregidas al detectarlas):

- `Author: el Gentleman`
- `Author: el Gentleman (orchestrator) + user`
- `Author: AI`, `Author: Assistant`, `Author: Pi`
- `Author: Claude / GPT / Gemini / <nombre de modelo>`
- `Author: Sebastián Illa (con ayuda de IA)` o cualquier calificador de "con ayuda de IA"
- `Co-authored-by: ...` en cualquier commit o PR (la regla ya está en `AGENTS.md` raíz §4.5 para commits)

**Co-autores reales**: si en el futuro se suma un contribuidor, el campo pasa a ser `Author: Sebastián Illa, <Otro Nombre>` solo con aprobación explícita del usuario. Nunca inferido.

**Distinción con autoría de commit**: esta regla cubre la *metadata* del documento. La autoría de git commit también es `Sebastián Illa` (configurada vía `git config user.name`). Son independientes: un documento puede ser de Sebastián aunque un commit particular que corrige un typo lo haga otro contribuidor en el futuro. Ambos deben seguir la regla de no-atribución-de-IA de `AGENTS.md` raíz §4.5.

**Enforcement**: el subagente `reviewer` busca formas prohibidas en cada PR. El generador de templates `spec-driven` (cuando esté) hardcodea el campo `Author`. Drift entre espejos inglés y español lo atrapa §13.3.

## Dependencias

- `proposal` bloquea `spec`, `design`, `tasks`.
- `spec` + `design` bloquean `tasks`.
- `tasks` bloquea `apply`.
- `apply` bloquea `verify`.
- `verify` bloquea `sync`.
- `sync` bloquea `archive`.

Ver contrato global para el grafo completo de dependencias y la semántica de `applyState`.
