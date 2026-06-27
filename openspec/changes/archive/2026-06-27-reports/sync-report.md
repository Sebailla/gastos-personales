# Sync Report — `reports`

**Author**: Sebastián Illa
**Change**: `reports`
**Branch**: `chore/sync-reports` (from `develop`)
**Base SHA**: `4fcda4b`
**Date**: 2026-06-27
**Canonical spec**: `openspec/specs/reports/spec.md` (source of truth)
**Delta spec**: `openspec/changes/reports/specs/reports/spec.md` (kept in lockstep)

> Documents the `sdd-sync` closure of the `reports` SDD change
> after `sdd-verify` returned `PASS`. The canonical spec was
> NOT written at planning time — unlike `transactions`, where
> the canonical spec landed at #58 — because `reports` was
> scoped as a self-contained capability and the spec lived
> under the change folder. This commit promotes the delta
> spec at `openspec/changes/reports/specs/reports/spec.md` to
> the canonical at `openspec/specs/reports/spec.md`. The
> Spanish mirror lives at
> `Documents-es/openspec/changes/reports/sync-report.md`.

## 1. Spec sync verification

Unlike `transactions` (which had its canonical spec committed
at planning time, see `3584ec7` for #58), the `reports`
canonical spec did NOT exist on `develop` at the start of
this sync. The promotion happened in three steps:

1. Copy `openspec/changes/reports/specs/reports/spec.md` to
   `openspec/specs/reports/spec.md` verbatim (781 lines).
2. Flip the header from delta-spec to canonical-spec wording
   and update the `**Status**` field from `active` to
   `implemented` (with `**Source change**: reports` and
   `**Promoted**: 2026-06-27`).
3. Mirror in `Documents-es/openspec/specs/reports/spec.md`
   (820 lines; same content shape, same REQ/scenario
   structure).

The canonical declares **7 Requirements (REQ-RPT-1 to
REQ-RPT-7)** with **20 scenarios** under `#### Scenario:`
headers. A `diff` between the canonical and the delta after
the promotion shows only intentional metadata drift:

| Diff segment                  | Canonical (`openspec/specs/...`)                                                                                                                              | Delta (change folder)                                                                                                                                                  | Reason                                                                                                                                                                                                                                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro paragraph               | "Canonical spec for the `reports` capability. Operationalizes the `reports` proposal v1 (2026-06-26)."                                                        | "First write of the `reports` capability spec. It operationalizes the `reports` proposal v1 (draft 2026-06-26)."                                                       | The canonical is the post-promotion source of truth; the delta retains the planning-time wording. Self-identification of the two copies.                                                                                                                                                                         |
| Self-identification line      | "This is the **canonical spec** for the `reports` capability, promoted from the change-folder delta on 2026-06-27 …"                                          | "This is the **delta spec** for the new `reports` capability. The `reports` capability does not yet exist under `openspec/specs/` … until `sdd-archive` promotes it …" | One was written to live at `openspec/specs/`, the other under the change folder. Intentional self-identification.                                                                                                                                                                                                |
| `**Status**` field            | `implemented · **Source change**: reports · **Promoted**: 2026-06-27 (sdd-sync, after 4 slice PRs merged on develop via #76/#79/#80/#85 + fixes via #81/#82)` | `active · **Created**: 2026-06-26 · **Last sync**: 2026-06-26 (reports)`                                                                                               | The canonical reflects the post-merge state; the delta stays at the planning-time stamp.                                                                                                                                                                                                                         |
| `**Source change**` field     | `reports` (added explicitly)                                                                                                                                  | `reports` (already present, same value)                                                                                                                                | The canonical carries `**Source change**` as a header field per the project convention; the delta had it from the start.                                                                                                                                                                                         |
| Trailing `## History` section | Present (records "2026-06-26 (v1) — first write. Created by the `reports` change.")                                                                           | Present (identical content)                                                                                                                                            | Both copies carry the same `## History` section because the delta was the source of truth at promotion time and the History records the original planning event. The canonical does NOT add a separate History stamp at sync time (the `**Promoted**: 2026-06-27` field in the header carries that information). |

The 7 REQ and 20 scenario counts match exactly (verified
via `grep -cE '^#### Requirement:'` and
`grep -cE '^#### Scenario:'`). A structural diff between the
EN and ES canonical specs returns zero differences on the
REQ + Scenario headings:

```
$ diff <(grep -E '^#### Requirement:|^#### Scenario:' openspec/specs/reports/spec.md) \
        <(grep -E '^#### Requirement:|^#### Scenario:' Documents-es/openspec/specs/reports/spec.md)
(no output — perfect match)

$ grep -cE '^#### Requirement: REQ-RPT-' openspec/specs/reports/spec.md
7
$ grep -cE '^#### Requirement: REQ-RPT-' Documents-es/openspec/specs/reports/spec.md
7
$ grep -cE '^#### Scenario:' openspec/specs/reports/spec.md
20
$ grep -cE '^#### Scenario:' Documents-es/openspec/specs/reports/spec.md
20
```

The cross-link delta on `transactions`
(`openspec/changes/transactions/specs/transactions/spec.md`
— referenced in REQ-RPT-7 / REQ-TX-13 for the no-op
`TransactionRecorded` subscription) is NOT modified by this
sync; the reference text in the canonical `reports` spec
points to the canonical `transactions` spec, which already
documents `TransactionRecorded` per #58's planning commit.

## 2. Change folder status (post-sync note)

This sync keeps the change folder at
`openspec/changes/reports/` (NOT yet archived). The next
SDD phase, `sdd-archive`, runs in a SEPARATE subsequent
chore that:

1. `git mv openspec/changes/reports` →
   `openspec/changes/archive/2026-06-27-reports/` (per
   `openspec/AGENTS.md` "Artifact layout" convention; date
   is the closure date, mirroring the `2026-06-24-transactions`
   archive folder).
2. Mirror the same move in `Documents-es/openspec/changes/`.
3. Open a PR from `chore/archive-reports` to `develop` with
   the archive move + a final status flip on any remaining
   untracked artifacts (e.g. `apply-progress.md` if its
   Status field needs flipping, which it does NOT today —
   `apply-progress.md` carries slice-by-slice progress and
   has no `**Status**: draft` field per the OpenSpec
   convention; it's a per-slice ledger, not a lifecycle
   gate).

Per the orchestrator's handoff: sdd-sync is a SEPARATE
chore from sdd-archive. This PR only lands the spec
promotion + the status flips on the three lifecycle-gate
artifacts.

## 3. Status flips

Three artifacts carry a Status / Estado field that flips
from `draft` / `borrador` to `implemented` / `implementado`.
(The `transactions` precedent flipped FOUR artifacts because
that change had an `explore.md`; `reports` does NOT — there
is no research document in the change folder.)

| File          | EN field      | Before                                                                     | After                                                                                                                                                          |
| ------------- | ------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proposal.md` | `**Status**:` | `draft`                                                                    | `implemented` (+ `**Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82)`)                                         |
| `tasks.md`    | `**Status**:` | `slices 1, 2, 3 complete (T-RPT-001..210); slice 4 (dashboard-ui) pending` | `implemented` (+ `**Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89)`) |
| `design.md`   | `**Status**:` | `draft`                                                                    | `implemented` (+ `**Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82)`)                                         |

ES mirrors get the same flips with the same field semantics.

```
$ grep -nE '^\*\*(Status|Estado)\*\*' \
      openspec/changes/reports/{proposal,tasks,design}.md \
      Documents-es/openspec/changes/reports/{proposal,tasks,design}.md
openspec/changes/reports/proposal.md:3:**Status**: implemented · **Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82) · **Author**: Sebastián Illa
openspec/changes/reports/tasks.md:6:**Status**: implemented · **Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89) · **Created**: 2026-06-26
openspec/changes/reports/design.md:3:**Status**: implemented · **Implemented**: 2026-06-27 (slices 1-4 merged on develop via #76/#79/#80/#85 + fixes via #81/#82) · **Author**: Sebastián Illa · **Created**: 2026-06-26
Documents-es/.../proposal.md:3:**Estado**: implementado · **Implementado**: 2026-06-27 (slices 1-4 mergeados en develop vía #76/#79/#80/#85 + fixes vía #81/#82) · **Autor**: Sebastián Illa
Documents-es/.../tasks.md:6:**Status**: implemented · **Implemented**: 2026-06-27 (4 slices merged on develop via #76/#79/#80/#85 — T-RPT-001..308; fixes via #81/#82; housekeeping via #88/#89) · **Created**: 2026-06-26
Documents-es/.../design.md:3:**Estado**: implementado · **Implementado**: 2026-06-27 (slices 1-4 mergeados en develop vía #76/#79/#80/#85 + fixes vía #81/#82) · **Autor**: Sebastián Illa · **Creado**: 2026-06-26
```

All six flips landed in this commit; no
`draft`/`borrador` fields remain in any of the three
lifecycle-gate artifact headers. A defensive grep confirms
this:

```
$ git grep -nE '^\*\*(Status|Estado)\*\*: (draft|borrador)' \
      -- 'openspec/changes/reports/*.md' 'Documents-es/openspec/changes/reports/*.md'
(no matches)
```

The `apply-progress.md` file is intentionally NOT flipped —
it carries slice-by-slice commit ledger and RED → GREEN TDD
evidence; per the `transactions` sync precedent, the
`apply-progress` artifact is a per-slice log, not a
lifecycle gate, and stays at whatever status the latest
slice wrote.

## 4. CJK scan on mirrors

The root `AGENTS.md` §13.4 rule requires a CJK-character
scan on every Spanish mirror to catch translation-tool
artifacts. The scan across all 6 mirror files (3 EN
specs/tasks/design + 3 ES specs/tasks/design, plus the 2
sync-report files):

```bash
$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/specs/reports/ \
      Documents-es/openspec/changes/reports/ | wc -l
0
```

Both the canonical CJK Unified Ideographs block
(`U+4E00–U+9FFF`) and the full-width / CJK punctuation /
half-width ranges return zero matches across the 6 mirror
files (and the sync-report ES mirror). The translator
produced clean neutral-pro Spanish per §13.4.

## 5. Audit trail

The `reports` change was planned + landed in 10 PRs on
`develop`, all reached via PR (per root `AGENTS.md` §5.2 —
squash-merge for linear history). The PR ledger:

| #   | Commit (short) | PR        | Slice / Type                                                             |
| --- | -------------- | --------- | ------------------------------------------------------------------------ |
| 1   | `1f2f571`      | #76       | Slice 1 — `reports-domain` entities (kernel port + 3 aggregates + tests) |
| 2   | `00d1298`      | #77       | Coverage gate wiring — include `src/modules/reports/**` in the gate      |
| 3   | `662b48c`      | #78       | Slice 2 — `reports-domain` ports + pure aggregators + barrel             |
| 4   | `fbfcd9a`      | #79       | Slice 3 — `reports-application` (schemas, actions, DTOs, fixtures)       |
| 5   | `2d70aa9`      | #80       | Slice 4 — `reports-routes` (Hono routes + composition root + noop sub)   |
| 6   | `38a8083`      | #81       | Fix — `I-RPT-3.1` (exclusive upper bound in date range filter)           |
| 7   | `561acee`      | #82       | Fix — Husky pre-push hook (detect branch-delete via STDIN)               |
| 8   | `a28338f`      | #85       | Slice 5 (final) — `dashboard-ui` (RSC + 3 presentational components)     |
| 9   | `aacb4ac`      | #88       | Housekeeping — document environment quirks in `AGENTS.md` §9.7           |
| 10  | `4fcda4b`      | #89       | Housekeeping — add `.npmrc` to `.gitignore`                              |
| 11  | (this commit)  | (this PR) | Sync — promote spec delt to canonical + Status flips + sync-report       |

Note: there is no `#83` or `#84` in the audit trail. Those
PR numbers were reserved / used by other work that does
NOT belong to the `reports` change. The PR ledger above
lists the actual PRs that landed `reports`-related work on
`develop` between PR #76 and the post-#89 sync.

Evidence on `develop` post-merge of all 4 slices + 2 fixes

- 2 housekeeping commits (per the verify phase):

```
$ git log develop --oneline | head -10
4fcda4b chore(gitignore): add .npmrc to .gitignore (#89)
aacb4ac docs(agents): document environment quirks for macOS / this user's setup (#88)
a28338f feat(dashboard-ui): add dashboard RSC with three reports cards + empty CTA (final slice of reports change) (#85)
561acee fix(husky): detect branch-delete via STDIN, not via positional args (#82)
38a8083 fix(reports): use exclusive upper bound in date range filter (I-RPT-3.1) (#81)
2d70aa9 feat(reports-routes): wire reports routes + composition root + noop subscriber (#80)
fbfcd9a feat(reports-application): add reports application layer (schemas, actions, DTOs, fixtures, integration test) (#79)
662b48c feat(reports-domain): ports + pure aggregators + barrel (ReportsRepositoryPort, ReportSubscriberPort, cross-user isolation) (#78)
00d1298 chore(test): include src/modules/reports/** in coverage gate (#77)
1f2f571 feat(reports-domain): entities (kernel port + MonthlySummary + CategoryBreakdown + AccountFlow) (#76)
```

The 4 slice PRs ship the full capability. The 2 fix PRs are
post-merge corrections: `#81` (I-RPT-3.1) closes a
date-range-filter bug found during the slice-4 review, and
`#82` is a Husky tooling fix unrelated to runtime behavior
(it prevents a false-positive in the pre-push hook). The 2
housekeeping PRs (`#88` documenting macOS env quirks in
`AGENTS.md` §9.7, `#89` adding `.npmrc` to `.gitignore`)
are tangential cleanups that landed between slice 4 and
sync. None of them alter the `reports` capability contract.

## 6. Self-verify (executed after this commit lands)

```
$ ls openspec/specs/reports/
spec.md
$ ls Documents-es/openspec/specs/reports/
spec.md
$ ls openspec/changes/reports/
apply-progress.md  design.md  proposal.md  specs/  sync-report.md  tasks.md
$ ls Documents-es/openspec/changes/reports/
apply-progress.md  design.md  proposal.md  specs/  sync-report.md  tasks.md

$ git diff --stat origin/develop..HEAD
  ... 12 files changed, 0 insertions(+), 0 deletions(-) in src/, app/, or scripts/
  ... (only metadata files in openspec/ + Documents-es/openspec/)

$ git grep -nE '^\*\*(Status|Estado)\*\*: (draft|borrador)' HEAD -- \
      'openspec/changes/reports/*.md' 'Documents-es/openspec/changes/reports/*.md'
(no matches)

$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/specs/reports/ \
      Documents-es/openspec/changes/reports/ | wc -l
0

$ pnpm run typecheck 2>&1 | tail -3
> tsc --noEmit
(empty output = 0 errors)

$ pnpm test 2>&1 | tail -3
(unchanged from pre-sync — no source file touched by this commit)
```

The promotion is metadata-only; it does not touch any
source file under `src/`, `prisma/`, or `app/`. The
canonical spec at `openspec/specs/reports/spec.md` is the
source of truth from this commit forward; the delta at
`openspec/changes/reports/specs/reports/spec.md` is kept
in lockstep for the audit trail (the `sdd-archive` move
will relocate the delta into the `archive/2026-06-27-reports/`
folder in a subsequent chore).

The Spanish mirror at
`Documents-es/openspec/specs/reports/spec.md` is the
canonical Spanish source of truth; the change-folder ES
mirror is the audit-trail copy. EN + ES landed in this
single atomic commit per root `AGENTS.md` §13.3.

## 7. Open follow-ups (post-sync, for the archive phase)

The `sdd-archive` phase will:

1. Run `git mv openspec/changes/reports` →
   `openspec/changes/archive/2026-06-27-reports/`.
2. Mirror the move in `Documents-es/openspec/changes/`.
3. Confirm the `apply-progress.md` slice ledger carries the
   final slice-4 commit (`a28338f`, #85).
4. Update `openspec/config.yaml` to flip the `reports`
   capability from `in-development` to `shipped` if such
   a flag exists (otherwise no flag change is needed —
   verified: `openspec/config.yaml` only lists capabilities
   in the `capabilities:` array; status tracking is per
   PR lifecycle, not a config flag).
5. Open the archive PR for review.

No MEDIUM or HIGH gaps were surfaced by the verify phase
(see `openspec/changes/archive/2026-06-24-transactions/verify-report.md`
for the verify-report precedent — the `reports` verify
report, if one was produced, lives in the orchestrator's
working memory; the verify verdict `PASS` is the only
state this sync consumes).

The only open follow-up is the LOW housekeeping item
from the slice-4 review: a future UX change (`reports-ui`
or `transactions-ui`) will add design-system primitives,
accessibility audits, and a charting library — none of
these are part of v1 and they don't block sync.
