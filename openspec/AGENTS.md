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

## Author attribution (docs metadata)

**The author of every document in this project is `Sebastián Illa`. No exceptions, no AI attribution, no agent names, no "co-authored" forms.**

Applies to the `**Author**:` (English) and `**Autor**:` (Spanish) header fields of every Markdown artifact created in the repo:

- `openspec/changes/<name>/{proposal,design,tasks,apply-progress,verify-report,sync-report}.md`
- `openspec/specs/<capability>/spec.md`
- `docs/architecture.md`, `docs/adr/*`, `README.md`, `CHANGELOG.md`, runbooks
- Every Spanish mirror under `Documents-es/...`

**Forbidden forms** (will be rejected by reviewer and corrected on detection):

- `Author: el Gentleman`
- `Author: el Gentleman (orchestrator) + user`
- `Author: AI`, `Author: Assistant`, `Author: Pi`
- `Author: Claude / GPT / Gemini / <model name>`
- `Author: Sebastián Illa (con ayuda de IA)` or any "with AI help" qualifier
- `Co-authored-by: ...` in any commit or PR (root `AGENTS.md` §4.5 already forbids this for commits)

**Real co-authors**: if a future contributor joins, the field becomes `Author: Sebastián Illa, <Other Name>` only after explicit user approval. Never inferred.

**Distinction from commit authorship**: this rule covers document *metadata*. Git commit authorship is also `Sebastián Illa` (configured via `git config user.name`). The two are independent: a document can be authored by Sebastián even if a particular commit fixing a typo was made by another contributor in the future. Both must follow the no-AI-attribution rule from root `AGENTS.md` §4.5.

**Enforcement**: the `reviewer` subagent checks for forbidden forms in every PR. The `spec-driven` template generator (when present) hard-codes the author field. Drift between English and Spanish mirrors is caught by §13.3.

## Dependencies

- `proposal` blocks `spec`, `design`, `tasks`.
- `spec` + `design` block `tasks`.
- `tasks` blocks `apply`.
- `apply` blocks `verify`.
- `verify` blocks `sync`.
- `sync` blocks `archive`.

See global contract for the full dependency graph and `applyState` semantics.
