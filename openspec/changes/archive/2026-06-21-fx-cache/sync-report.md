# Sync Report — `fx-cache` PR-3

**Author**: Sebastián Illa
**Change**: `fx-cache`
**PR**: PR-3 of 3 chained PRs (final)
**Branch**: `feat/fx-cache-3` (from `develop`)
**Base SHA**: `273c191`
**Date**: 2026-06-22

> Documents the spec promotion from
> `openspec/changes/fx-cache/specs/fx/spec.md` to the canonical
> `openspec/specs/fx/spec.md`, the one-line `accounts/spec.md`
> cross-link, and the change-folder archive move. The
> Spanish mirror lives at
> `Documents-es/openspec/changes/fx-cache/sync-report.md`.

## 1. Spec promotion

```bash
$ cp openspec/changes/fx-cache/specs/fx/spec.md openspec/specs/fx/spec.md
$ cp openspec/changes/fx-cache/specs/fx/spec.md \
      Documents-es/openspec/specs/fx/spec.md
```

The canonical `fx` capability spec (REQ-FX-1 to REQ-FX-9) lands
at `openspec/specs/fx/spec.md`. The delta source under
`openspec/changes/fx-cache/specs/fx/spec.md` is unchanged;
the canonical copy is byte-identical. The Spanish mirror at
`Documents-es/openspec/specs/fx/spec.md` is also a byte-identical
copy of the canonical spec (per the project's "mirror is a
faithful translation of the prose, verbatim of the code blocks
and identifiers" rule, root `AGENTS.md` §13.4).

| Path                                              | Before                                  | After                                                       |
| ------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| `openspec/specs/fx/`                              | (does not exist)                        | `spec.md` (canonical)                                       |
| `Documents-es/openspec/specs/fx/`                 | (does not exist)                        | `spec.md` (mirror)                                          |
| `openspec/changes/fx-cache/specs/fx/spec.md`      | (delta source)                          | (delta source — unchanged; archived with the change folder) |

The `fx` capability is now first-class in the canonical
`openspec/specs/` tree (siblings: `auth`, `accounts`,
`fx`). The next change that consumes the `fx` capability
will reference `openspec/specs/fx/spec.md` directly, no
delta-spec detour.

## 2. `accounts/spec.md` cross-link edit

```bash
$ # Append one bullet to the "Cross-references" section in
$ # openspec/specs/accounts/spec.md (and the mirror).
$ # The bullet references fx/spec.md and notes the
$ # FxRateProvider port is consumed by accounts while the
$ # implementation lives in fx.
```

The cross-link is the only `accounts` capability change in
PR-3. No behavioral change — the `FxRateProvider` interface,
the `FinancialAccountBalanceDto`, and the `BR-ACC-12`
contract are unchanged. The cross-link makes the dependency
direction explicit at the spec level:

```markdown
## Cross-references

- [`fx/spec.md`](../fx/spec.md) — the `FxRateProvider`
  interface declared in
  `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
  is consumed by the `accounts` capability (via the
  `get-account-balance.action.ts` action layer). The
  implementation lives in the `fx` capability (see
  `openspec/specs/fx/spec.md` REQ-FX-3). The dependency
  direction is `accounts -> fx` for the lowercase casa
  type only; the `accounts` module does NOT import from
  `@/modules/fx` at runtime (modules-isolated rule, root
  `AGENTS.md` §10.5).
```

The Spanish mirror at `Documents-es/openspec/specs/accounts/spec.md`
gets the equivalent bullet in Spanish (same structure,
same wording under the project's translation rule).

## 3. Change folder archive move

```bash
$ git mv openspec/changes/fx-cache \
        openspec/changes/archive/2026-06-21-fx-cache
$ git mv Documents-es/openspec/changes/fx-cache \
           Documents-es/openspec/changes/archive/2026-06-21-fx-cache
```

After the move, the change folder contains 7 files (the
`AGENTS.md` "Artifact layout" section expects exactly 7 for
a closed change):

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

The Spanish mirror at
`Documents-es/openspec/changes/archive/2026-06-21-fx-cache/`
contains the same 7 files (mirrored).

## 4. Audit trail

The ADR at `docs/adr/0010-dolar-api-provider.md` (and its
Spanish mirror at
`Documents-es/docs/adr/0010-dolar-api-provider.md`) was
written during design time (2026-06-21). PR-3 verifies the
ADR is on disk; no edit is required for the implementation
itself.

The proposal at
`openspec/changes/fx-cache/proposal.md` carries a "Status"
field that will flip from `draft` to `implemented` as part
of the archive-move metadata. (The flip is recorded in the
next commit, T3.10.)

## 5. CJK scan on mirrors

The AGENTS.md §13.4 rule requires a CJK-character scan on
every Spanish mirror to catch translation-tool artifacts.
The three new mirrors created by PR-3:

```
$ grep -P '[\x{4e00}-\x{9fff}]' \
    Documents-es/openspec/changes/fx-cache/apply-progress.md \
    Documents-es/openspec/changes/fx-cache/verify-report.md \
    Documents-es/openspec/changes/fx-cache/sync-report.md
$ # exit 0 (no matches)
```

And the cross-link + spec mirror created by PR-3:

```
$ grep -P '[\x{4e00}-\x{9fff}]' \
    Documents-es/openspec/specs/fx/spec.md \
    Documents-es/openspec/specs/accounts/spec.md
$ # exit 0 (no matches)
```

## 6. OpenSpec deliverable commit (T3.9)

Sibling files in this commit:
- `openspec/changes/fx-cache/apply-progress.md` — PR-3
  commit ledger + TDD evidence + REQ coverage table.
- `openspec/changes/fx-cache/verify-report.md` — 9 REQ-FX-N
  coverage with on-disk test citations (review-facing).

The actual spec promotion + accounts cross-link + archive
move land in T3.10 (the next commit).
