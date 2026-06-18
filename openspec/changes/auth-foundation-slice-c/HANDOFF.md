# Handoff — Re-open Closure — `auth-foundation-slice-c`

**Status**: closed-via-archive · **Author**: Sebastián Illa · **Date**: 2026-06-18

## What is now true

This directory (`openspec/changes/auth-foundation-slice-c/`) is a **re-open** of the
`auth-foundation-slice-c` change that was already fully closed in a prior session
(2026-06-13/14). The closure is recorded here so that anyone landing on this directory
in the future understands the relationship between the active planning artifacts and
the completed lifecycle in `openspec/changes/archive/auth-foundation-slice-c/`.

## Lifecycle of the original change (2026-06-13/14)

| Phase   | Status  | Evidence                                                                                                                                                                                                                     |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apply   | ✅ done | PRs #19 (C-1), #20 (C-2), C-3 (docs+handoff). 14 tasks complete: T-C1.0 + T-025..T-033. `openspec/changes/archive/auth-foundation-slice-c/apply-progress.md` records every commit.                                           |
| verify  | ✅ done | `openspec/changes/archive/auth-foundation-slice-c/verify-report.md` — status `PASS_WITH_FLAGS`. No CRITICAL blockers. Two WARNING flags inherited from the parent Slice A+B verify.                                          |
| sync    | ✅ done | `openspec/changes/archive/auth-foundation-slice-c/sync-report.md` — status `synced`. 11 of 16 deltas promoted into `openspec/specs/auth/spec.md` (canonical, EN) and `Documents-es/openspec/specs/auth/spec.md` (ES mirror). |
| archive | ✅ done | Both `auth-foundation` and `auth-foundation-slice-c` moved into `openspec/changes/archive/` on 2026-06-14.                                                                                                                   |

## Flag status on this re-open

The 2026-06-14 verify-report (`openspec/changes/archive/auth-foundation-slice-c/verify-report.md`)
flagged two WARNING items. Their status as of this commit (2026-06-18):

| Flag                                                                                          | Severity                        | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------- | ------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FLAG-1 (module-resolution bug, issue #18)                                                     | CRITICAL → closed in C-1        | ✅ resolved                 | PR #19 (commit `f055938`) added the `resolve.alias` patch and the 30-line `test/stubs/next-server.ts` stub. Three previously-excluded test files now run.                                                                                                                                                                                                                                                         |
| FLAG-V1 (test count drift, 132/135 vs spec target 137/137)                                    | WARNING                         | ⚠️ deferred                 | Per verify-report §3.2: "two runtime `DUMMY_HASH` cases in `authjs.test.ts` were folded into a single static check" (C-1 commit body). Not a blocker for archive; flagged as follow-up. Resolution requires either re-adding the two runtime cases OR updating the spec acceptance criterion to reflect the static-check consolidation. Recommend a separate `chore(tests): resolve FLAG-V1 test count drift` PR. |
| FLAG-V2 (next-auth@5.0.0-beta.25 on dev machines vs pinned 5.0.0-beta.31)                     | WARNING                         | ✅ resolved on this machine | Verified 2026-06-18: `node_modules/next-auth/package.json` reports `5.0.0-beta.31`, matching the pin in `package.json` and the lockfile. Any fresh `pnpm install --frozen-lockfile` (CI does this on every run) resolves the drift. Per verify-report §3.2: "CI is the authoritative gate". No further action required.                                                                                           |
| FLAG-2 (bilingual drift in `Documents-es/openspec/changes/auth-foundation/apply-progress.md`) | WARNING → closed in C-3 handoff | ✅ resolved                 | C-3 handoff commit re-synced the Spanish mirror.                                                                                                                                                                                                                                                                                                                                                                  |

## Why this re-open exists

This directory remained in `openspec/changes/` (instead of being moved to `archive/`
along with the original) because the parent change's archive directory
(`openspec/changes/archive/auth-foundation/`) was set up without a `verify-report.md`
or `sync-report.md`. The convention is that a re-open stays active until all parent
flags are closed. Since FLAG-V1 is the only remaining open item and it is deferred
(scope: a `chore(tests)` PR, not an SDD change), this re-open is being **closed
without a new apply phase** — the original lifecycle is the canonical one.

## Status of the artifacts in this directory

The four planning artifacts (`proposal.md`, `spec.md`, `design.md`, `tasks.md`)
are preserved verbatim from the original planning. Their header `Status` field
has been updated from `draft` / `ready-for-apply` to `closed-via-archive` to
reflect the actual state. The task checkboxes in `tasks.md` are intentionally
left in their original `[ ]` state — the canonical completion record lives in
`openspec/changes/archive/auth-foundation-slice-c/tasks.md` (where the same tasks
are `[x]`).

## What's needed to start the next SDD change

The six capabilities that were unblocked by `auth-foundation` closure
(`accounts-ledger`, `transactions`, `fx-cache`, `networth-snapshot`,
`reports-mvp`, `pwa-shell`, `fly-deploy`) have been technically unblocked since
2026-06-14. This re-open closure is bookkeeping, not a gate.

Recommended next move: `/sdd-new accounts-ledger` (or whichever capability the
user picks). Run the SDD preflight, then `sdd-init` → `sdd-proposal`.

## Files changed by this handoff

- `openspec/changes/auth-foundation-slice-c/HANDOFF.md` (this file, new)
- `openspec/changes/auth-foundation-slice-c/proposal.md` — header `Status` updated
- `openspec/changes/auth-foundation-slice-c/spec.md` — header `Status` updated
- `openspec/changes/auth-foundation-slice-c/design.md` — header `Status` updated
- `openspec/changes/auth-foundation-slice-c/tasks.md` — header `Status` updated

No source code touched. No tests touched. No `openspec/specs/auth/spec.md`
touched (canonical already includes the synced deltas from 2026-06-14).
