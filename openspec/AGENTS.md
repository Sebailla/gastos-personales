# OpenSpec Working Agreement — gastos-personales

Project-specific rules for the OpenSpec workflow in this repo. Overrides `~/.pi/agent/gentle-ai/support/sdd-status-contract.md` only where explicitly stated.

## Status resolution order

1. Parent-provided status (interactive session).
2. This file.
3. Global `~/.pi/agent/gentle-ai/support/sdd-status-contract.md`.

## Artifact layout

```
openspec/
├── config.yaml                 # schema, capabilities, preflight
├── AGENTS.md                   # this file
├── changes/                    # active SDD changes
│   ├── <change-name>/
│   │   ├── proposal.md
│   │   ├── tasks.md
│   │   ├── design.md
│   │   ├── apply-progress.md
│   │   ├── verify-report.md
│   │   └── sync-report.md
│   └── archive/                # closed changes
└── specs/                      # canonical spec per capability
    ├── auth/spec.md
    ├── accounts/spec.md
    ├── transactions/spec.md
    ├── fx/spec.md
    ├── snapshots/spec.md
    ├── reports/spec.md
    └── ui/spec.md
```

Spanish mirror of every file in this tree lives at `Documents-es/openspec/...` with the same relative path. Update both in the same commit. See root `AGENTS.md` §13.

## Change naming

`<scope>-<slice>` in kebab-case. Examples: `auth-foundation`, `accounts-ledger`, `fx-cache`, `networth-snapshot`. Not the implementation ticket number.

## Dependencies

- `proposal` blocks `spec`, `design`, `tasks`.
- `spec` + `design` block `tasks`.
- `tasks` blocks `apply`.
- `apply` blocks `verify`.
- `verify` blocks `sync`.
- `sync` blocks `archive`.

See global contract for the full dependency graph and `applyState` semantics.
