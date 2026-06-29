# Archive Report — `transactions-ui`

**Author**: Sebastián Illa
**Change**: `transactions-ui`
**Phase**: sdd-archive (hybrid: filesystem + Engram)
**Branch**: `chore/transactions-ui-archive` (from `develop` post #104)
**Date**: 2026-06-29
**Mode**: hybrid
**Source of truth**: `openspec/specs/<capability>/spec.md` per `openspec/AGENTS.md`

---

## 1. Change summary

`transactions-ui` introduced the **first write of the `ui` capability**
of the project: a 23-primitive design system + 5-primitive layout shell

- the production-grade Server Component renders for `/accounts/*`,
  `/transactions/*`, and `/dashboard`, plus the additive query flags
  (`include=lastActivity`, `include=accountName`) that wire the UI to the
  existing Hono endpoints. It also REPLACED the smoke-UI requirement
  REQ-TX-15 in the `transactions` capability with a thin pointer to the
  new `ui/spec.md`. The change shipped in **6 chained slice PRs**
  (#98 → #103) against `develop` plus a **4R review cleanup PR (#104)**,
  all merged.

The change was a **force-chained, 400-line-budget** delivery per
`openspec/config.yaml:21` (auto-forecast cache). No slice exceeded
the per-slice review budget; the cumulative LoC was within the
design's forecast (1,520–2,220 across 6 slices).

The `ui` capability slot was reserved at `openspec/config.yaml:15`
before the change started; `sdd-archive` (this phase) promotes the
delta spec to canonical.

---

## 2. Spec sync (delta → canonical)

| Domain         | Action        | Details                                                                                                    | Files                                                                                                                               |
| -------------- | ------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `ui`           | **CREATED**   | First write of the `ui` capability. 11 Requirements (REQ-UI-1 to REQ-UI-11) lifted verbatim from delta.    | `openspec/specs/ui/spec.md` (canonical) · `openspec/changes/transactions-ui/specs/ui/spec.md` (delta, archived)                     |
| `transactions` | **MODIFIED**  | REQ-TX-15 REPLACED with thin pointer to `openspec/specs/ui/spec.md` REQ-UI-1..11. REQ-TX-1..14 unchanged.  | `openspec/specs/transactions/spec.md` (canonical) · `openspec/changes/transactions-ui/specs/transactions/spec.md` (delta, archived) |
| `accounts`     | **NO CHANGE** | Two additive query flags land in the existing GET endpoints (no spec deltas; behavior change is additive). | n/a                                                                                                                                 |
| `reports`      | **NO CHANGE** | Dashboard's `?accountId=` + `?month=` are pure UI state per REQ-UI-3.                                      | n/a                                                                                                                                 |
| `auth`         | **NO CHANGE** | Every page keeps the `auth()` Server Component gate from `auth-foundation`.                                | n/a                                                                                                                                 |
| `fx`           | **NO CHANGE** | The `FxRateProvider` 503 path is unchanged; production UI surfaces its error message verbatim.             | n/a                                                                                                                                 |
| `errors`       | **NO CHANGE** | The `ErrorEnvelope` from `src/shared/errors/app-error.ts` is reused.                                       | n/a                                                                                                                                 |

### Verification

```bash
# ui spec — delta vs canonical
diff openspec/changes/transactions-ui/specs/ui/spec.md openspec/specs/ui/spec.md
# → only the framing `Status:` field + the "this is the delta / this is the canonical" prose differ.
#   11 Requirements, 0 body mismatches, 0 missing headings.

# transactions spec — delta vs canonical
diff openspec/changes/transactions-ui/specs/transactions/spec.md openspec/specs/transactions/spec.md
# → only the framing `Status:` field + the delta table + REQ-TX-15 REPLACED wording differ.
#   REQ-TX-1..14 body content identical; REQ-TX-15 body now points to ui/spec.md.
```

### REQ-TX-15 status (canonical)

`openspec/specs/transactions/spec.md` contains a `### Requirement:`
heading for REQ-TX-15 whose body is the **thin pointer** to
`openspec/specs/ui/spec.md` REQ-UI-1 to REQ-UI-11. The smoke UI
wording from the pre-`transactions-ui` canonical was REPLACED; the
two additive query flags (REQ-UI-1 + REQ-UI-2) and the list-page
state machine (REQ-UI-3) are now owned by the `ui` capability, not
the `transactions` capability.

---

## 3. PR list (6 slices + 1 cleanup, all merged on `develop`)

| PR   | Title                                                                                                                                   | Slice                 | SHA (merge commit) | Merged on  |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------ | ---------- |
| #98  | `feat(ui-primitives): tokens + 18 primitives + layout shell (slice 1 of 6 for transactions-ui)`                                         | 1 — `ui-primitives`   | `be85e9a`          | 2026-06-28 |
| #99  | `feat(ui-accounts): production renders for accounts pages (slice 2 of 6 for transactions-ui)`                                           | 2 — `accounts-ui`     | `46b58d2`          | 2026-06-28 |
| #100 | `feat(ui-transactions): production renders for transactions pages (slice 3 of 6 for transactions-ui)`                                   | 3 — `transactions-ui` | `43e72a1`          | 2026-06-28 |
| #101 | `feat(ui-dashboard-refactor): production renders for dashboard with account picker + month switcher (slice 4 of 6 for transactions-ui)` | 4 — `dashboard-ui`    | `9b4f7c0`          | 2026-06-28 |
| #102 | `test(ui-integration-tests): slice 5 axe-core a11y + visual snapshots + E2E happy paths`                                                | 5 — `integration`     | `b8c1d4e`          | 2026-06-28 |
| #103 | `docs(ui-docs-and-perf): design-system ref + QA checklist + perf budget + sdd-archive (slice 6 of 6 for transactions-ui)`               | 6 — `docs-and-perf`   | `7ee9d71`          | 2026-06-29 |
| #104 | `fix(ui-4r-cleanup): top-5 4R review findings (as casts + Suspense + 'use client' + UUID + doc count)`                                  | cleanup (post-4R)     | `508b258`          | 2026-06-29 |

All 7 PRs are merged on `develop` (current head: `508b258`, post #104).
The `chore/transactions-ui-archive` worktree was created from this head.

---

## 4. Task completion — 81/83 done, 2 user-owned (NOT blocking)

| Metric                            | Value                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Total tasks                       | **83** (T-UI-001..029 + T-UI-101..110 + T-UI-201..210 + T-UI-301..310 + T-UI-401..416 + T-UI-501..508) |
| Done                              | **81**                                                                                                 |
| Pending (user-owned)              | **2** — T-UI-505 (Lighthouse p95 < 2s sweep), T-UI-506 (manual QA sign-off)                            |
| Other (blocked/skipped/cancelled) | **0**                                                                                                  |

### Why the 2 user-owned tasks do NOT block archive

Per the orchestrator's brief (this phase's launch prompt) and
slice 6 design §16.6, the two pending tasks are **intentionally**
left `pending (user-owned)` because the orchestrator cannot run
them in the current environment:

- **T-UI-505** — Lighthouse p95 < 2s on `/` + `/dashboard` +
  `/transactions`. The verify gate runs `pnpm build && pnpm start &`
  - three `lighthouse` CLI invocations against the running dev
    server. Local `pnpm run build` is BLOCKED on missing `.env` (a
    pre-existing project gap documented since slice 1). The user
    has the `.env` + the running dev server. The CLI commands are
    documented verbatim in `docs/perf/transactions-ui.md` §3 with
    JSON summary placeholders in §4. **If p95 > 2s on the dashboard,
    the design §16.5 mitigation splits the dashboard's three
    parallel calls into two chunks.**
- **T-UI-506** — Manual QA sign-off (REQ-UI-11). The
  `docs/qa/transactions-ui.md` §9 sign-off section is intentionally
  left blank; the user runs the keyboard-nav + screen-reader +
  dark-mode checklist (30–45 min) post-merge and fills the section.

Both tasks remain in the archived `tasks.md` with the
`pending (user-owned)` annotation. The slice 5 and slice 6
sections of `openspec/changes/transactions-ui/apply-progress.md`
already document the user-owned reason explicitly (in EN + ES
inline mirrors for slice 6). This archive phase does not
reconcile or remove the two checkboxes; it preserves them as
the project's record that the cycle closed cleanly with the
two known user follow-ups queued.

The orchestrator's brief is explicit: **"Do NOT block archive on
these 2 — record the reason in the archive report and proceed."**
This section is that record.

---

## 5. Archive contents (target)

```
openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NEW — this file, sdd-archive phase report)
├── proposal.md         (Status: draft → archived 2026-06-29)
├── design.md           (3,188 LoC; 20 sections; status: draft — preserved as-is)
├── tasks.md            (Status: slices 1..6 implemented; 81/83 done; 2 user-owned)
├── apply-progress.md   (2,132 LoC + 2 new `## Archive closure` sections: EN + ES)
└── specs/
    ├── ui/spec.md              (verbatim mirror of canonical delta)
    └── transactions/spec.md    (REQ-TX-15 REPLACED delta)

Documents-es/openspec/changes/archive/2026-06-29-transactions-ui/
├── archive-report.md   (NEW — sdd-archive phase report, ES)
├── proposal.md         (Estado: archivado 2026-06-29)
├── design.md
├── tasks.md            (Status slices 1..6; 81/83; 2 user-owned)
├── apply-progress.md   (NEW — thin pointer + ES archive closure)
└── specs/
    ├── ui/spec.md
    └── transactions/spec.md
```

---

## 6. Spanish mirror sync — all pairs verified

| File pair                                                                                                      | Diff result                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `openspec/changes/transactions-ui/proposal.md` ↔ `Documents-es/.../proposal.md`                               | Translation only (`Author`/`Autor` + prose). Structure + headings 1:1.                                       |
| `openspec/changes/transactions-ui/design.md` ↔ `Documents-es/.../design.md`                                   | Translation only. Structure + headings + code blocks 1:1.                                                    |
| `openspec/changes/transactions-ui/tasks.md` ↔ `Documents-es/.../tasks.md`                                     | Translation only. Task tables 1:1; status field updated to identical post-archive wording in both languages. |
| `openspec/changes/transactions-ui/specs/ui/spec.md` ↔ `Documents-es/.../specs/ui/spec.md`                     | Translation only. 11 Requirements 1:1.                                                                       |
| `openspec/changes/transactions-ui/specs/transactions/spec.md` ↔ `Documents-es/.../specs/transactions/spec.md` | Translation only. REQ-TX-15 REPLACED 1:1.                                                                    |
| `openspec/specs/ui/spec.md` ↔ `Documents-es/.../specs/ui/spec.md`                                             | Translation only. 11 Requirements 1:1.                                                                       |
| `openspec/specs/transactions/spec.md` ↔ `Documents-es/.../specs/transactions/spec.md`                         | Translation only. REQ-TX-15 thin pointer 1:1.                                                                |

**One pre-existing gap (flagged, not introduced by archive):** the
EN `apply-progress.md` (2,132 LoC) is not mirrored verbatim in
`Documents-es/.../apply-progress.md`. The EN file does contain
in-line ES sections for slices 4–6 (the slice workers' choice
during apply), but no separate ES file existed under
`Documents-es/`. The archive phase creates the ES mirror as a
**thin pointer file** containing only the archive-closure section
translated. A future housekeeping change could backfill the
full ES translation of slices 1–3 (see flag F1 in §8).

---

## 7. Source of truth updated

The following canonical specs now reflect the new behavior:

- **`openspec/specs/ui/spec.md`** — new capability; 11 Requirements
  (REQ-UI-1 to REQ-UI-11) covering design-system tokens, the
  primitive + layout-shell inventory, the additive query flags
  on `/api/accounts` and `/api/transactions`, the list-page state
  machine, the dashboard month switcher, the WCAG 2.2 AA a11y
  floor, and the user-owned manual QA checklist.
- **`openspec/specs/transactions/spec.md`** — REQ-TX-15 REPLACED
  with a thin pointer to `openspec/specs/ui/spec.md`. The smoke
  UI wording is removed; the production UI surface is owned by
  the `ui` capability.

The `ui` capability slot at `openspec/config.yaml:15` is now
filled. Future UI evolution (`ui-dark-mode`, `ui-i18n`,
`ui-charts`) lands as additions to the `ui` capability, not as
further revisions of REQ-TX-N in `transactions/spec.md`.

---

## 8. Open questions / flags

- **F1 (pre-existing, not introduced by this archive).** The ES
  mirror of the EN `apply-progress.md` is a thin pointer covering
  only the archive-closure section, not a full translation. This
  is a §10.3 ecosystem anti-pattern in spirit but not in letter
  (the EN file itself contains in-file ES sections for slices
  4–6). **Recommendation:** a future housekeeping change
  (`chore/docs-backfill-transactions-ui-apply-progress-es`) could
  backfill the full ES translation of slices 1–3. **Owner:**
  user (decide whether the partial mirror is acceptable or
  worth backfilling). **What to confirm:** whether the user
  wants the backfill, or whether the in-file ES pattern in the
  EN source is acceptable.
- **F2 (user action, not blocking).** T-UI-505 + T-UI-506 remain
  `pending (user-owned)`. The archived `tasks.md` preserves this
  state on purpose; the orchestrator will not re-open the change.
  **Owner:** user. **What to confirm:** when the user runs the
  Lighthouse sweep + the manual QA checklist post-merge, they
  either sign off (closing the loop) or file a follow-up change
  (`fix/ui-...` or `feat/ui-...`) if a finding requires work.
- **F3 (new pattern, documented).** This `archive-report.md`
  file is **the first** of its kind in this project's archive
  history. The 5 prior archives (`auth-foundation`,
  `auth-foundation-slice-c`, `2026-06-19-accounts-ledger`,
  `2026-06-21-fx-cache`, `2026-06-24-transactions`,
  `2026-06-27-reports`) all closed with `apply-progress.md` +
  `proposal.md` `Status:` updates + `tasks.md` `Status:` updates
  but no `archive-report.md` artifact. The `sdd-archive` SKILL.md
  §Step 5 mandates this file; the orchestrator's brief explicitly
  requested it. **Recommendation:** future `sdd-archive` phases
  follow this pattern (file + Engram `sdd/<change>/archive-report`
  observation). **What to confirm:** adopt the pattern project-wide.

---

## 9. SDD cycle complete

The `transactions-ui` change has been fully:

1. **Planned** — proposal v1 (704 LoC) + design v1 (3,188 LoC, 20
   sections) + 11-requirement spec delta + 83-task tracker with
   force-chained 400-line-budget delivery strategy.
2. **Implemented** — 6 chained slice PRs (#98 → #103) + 4R cleanup
   PR (#104), all merged on `develop` at `508b258`. ~2,000 LoC
   across 6 slices, within the design's 1,520–2,220 forecast.
3. **Verified** — slice 5 landed axe-core a11y + visual snapshots
   - E2E happy paths; slice 6 added the manual QA checklist
   - perf budget verification + design-system reference. The 2
     remaining verification tasks are explicitly user-owned per
     design §16.6 and the orchestrator's brief.
4. **Synced** — `openspec/specs/ui/spec.md` created (verbatim
   from delta) and `openspec/specs/transactions/spec.md`
   modified (REQ-TX-15 REPLACED with thin pointer). Both
   promotions landed on `develop` via slice 6 commit `ec2e589`.
5. **Archived** — this phase moves the change folder to
   `openspec/changes/archive/2026-06-29-transactions-ui/` and
   records the cycle in this `archive-report.md` + the
   Engram observation `sdd/transactions-ui/archive-report`.

The `ui` capability is now a first-class capability of the
project. The next SDD change can start (the obvious next
candidates are `networth-snapshot` per the proposal's
"Downstream" hint, or `ui-dark-mode` per the REQ-TX-15
REPLACED note, or `ui-i18n` per the design-system
extensibility sections).

---

## 10. Engram observation (hybrid mode)

Per the orchestrator's brief (hybrid mode) and the `sdd-archive`
SKILL.md §Step 5 + `sdd-phase-common.md` §C:

- `topic_key`: `sdd/transactions-ui/archive-report`
- `type`: `architecture`
- `capture_prompt`: `false` (this is an automated artifact, not
  a human/proactive memory save)
- `scope`: `project`
- `content`: condensed version of this report (≤ 2 KB) with all
  PR numbers, dates, file paths, and the explicit user-owned-task
  acknowledgment.

The observation ID is reported in the executor's return summary
(see `acceptance-report`).

---

## 11. Commit (atomic, single commit on `chore/transactions-ui-archive`)

- Move `openspec/changes/transactions-ui/` →
  `openspec/changes/archive/2026-06-29-transactions-ui/`
  (English source: 6 files + 2 spec files)
- Move `Documents-es/openspec/changes/transactions-ui/` →
  `Documents-es/openspec/changes/archive/2026-06-29-transactions-ui/`
  (Spanish mirror: 4 files + 2 spec files)
- Update `proposal.md` `Status:` field (EN + ES) to
  `archived (2026-06-29, sdd-archive after PR #104)`
- Update `tasks.md` `Status:` field (EN + ES) to reflect
  the post-archive state (slices 1..6; 81/83 done; 2 user-owned)
- Append `## Archive closure — 2026-06-29 (PR #104, sdd-archive)`
  to `apply-progress.md` (EN) and
  `## Archive closure — 2026-06-29 (PR #104, sdd-archive) — mirror (castellano)`
  to the same file (matching the in-file bilingual pattern the
  slice workers used for slices 4–6)
- Create `apply-progress.md` (ES) at
  `Documents-es/.../archive/2026-06-29-transactions-ui/apply-progress.md`
  as a thin pointer file with the ES archive closure
- Create `archive-report.md` (EN + ES) at
  `openspec/.../archive/2026-06-29-transactions-ui/archive-report.md`
  and the ES mirror
- Commit message:
  `chore(sdd): archive transactions-ui (sdd-archive phase, 6 slices + 4R cleanup all merged)`

No production code is touched. No version bump (this is not a
release per root `AGENTS.md` §5.5; the `CHANGELOG.md` `[Unreleased]`
entry already landed in slice 6 T-UI-504). No `openspec/config.yaml`
change (the `ui` capability slot at line 15 was reserved before
the change started and is now filled by the canonical spec).
