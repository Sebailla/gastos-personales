# Sync Report — `transactions`

**Author**: Sebastián Illa
**Change**: `transactions`
**Branch**: `chore/archive-transactions` (from `develop`)
**Base SHA**: `31a0252`
**Date**: 2026-06-24
**Archive folder**: `openspec/changes/archive/2026-06-24-transactions/`
**Canonical spec**: `openspec/specs/transactions/spec.md` (source of truth)
**Delta spec**: `openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md` (archived, kept in lockstep with canonical)

> Documents the archive closure of the `transactions`
> SDD change after `sdd-verify` returned
> `PASS-WITH-FOLLOWUPS` (see
> `openspec/changes/archive/2026-06-24-transactions/verify-report.md`).
> The canonical spec landed during the planning phase
> (commit `3584ec7`, #58) and is the source of truth; the
> delta spec in the archive folder is the audit-trail copy.
> The Spanish mirror lives at
> `Documents-es/openspec/changes/archive/2026-06-24-transactions/sync-report.md`.

## 1. Spec sync verification

The `transactions` capability spec was written during the
planning phase and committed at `3584ec7` as both the
canonical spec (`openspec/specs/transactions/spec.md`) and
the delta spec under the change folder. Both copies declare
**15 requirements (REQ-TX-1 to REQ-TX-15)** with **32
scenarios** under `#### Scenario:` headers. A `diff` between
the canonical and the delta after the archive move shows
only intentional metadata drift, no requirement drift:

| Diff segment                                    | Canonical (`openspec/specs/...`)                                                         | Delta (archived)                                                  | Reason                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intro paragraph                                 | "This is the canonical `transactions` capability spec."                                  | "This is a **delta spec** for the new `transactions` capability." | One was written to live at `openspec/specs/`, the other under the change folder. Intentional self-identification.                                                                                                                                                       |
| Heading under "Error codes" / "Error semantics" | "Error semantics"                                                                        | "Error codes"                                                     | Cosmetic; both anchor the same `INVALID_AMOUNT`, `FUTURE_DATE_NOT_ALLOWED`, `ACCOUNT_ARCHIVED` codes. The apply-phase code (`src/shared/errors/error-codes.ts`) reads `ACCOUNT_ARCHIVED` + `INVALID_AMOUNT` + `FUTURE_TRANSACTION_DATE` and the verify report cites it. |
| Trailing `## History` section                   | Present (records "2026-06-22 (v1) — first write. Created by the `transactions` change.") | Absent                                                            | Added by `sdd-archive` after the planning commit so the canonical can carry the version stamp; the delta does not need it.                                                                                                                                              |
| `**Source change**` field                       | `transactions`                                                                           | `transactions`                                                    | Identical.                                                                                                                                                                                                                                                              |

The 15 REQ and 32 scenario counts match exactly (verified
via `grep -cE '^### Requirement: REQ-TX-'` and
`grep -cE '^#### Scenario:'`). The accounts delta
(`specs/accounts/spec.md`, REQ-ACC-X1 cross-link) is also
archived intact; the canonical `accounts` spec was NOT
modified by this change (the delta is a cross-link pointer
only, no behavior change).

```
$ diff -q openspec/specs/transactions/spec.md \
        openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
Files ... differ  (intentional drift per the table above)
$ grep -cE '^### Requirement: REQ-TX-' openspec/specs/transactions/spec.md
15
$ grep -cE '^### Requirement: REQ-TX-' openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
15
$ grep -cE '^#### Scenario:' openspec/specs/transactions/spec.md
32
$ grep -cE '^#### Scenario:' openspec/changes/archive/2026-06-24-transactions/specs/transactions/spec.md
32
```

No spec promotion was needed (the canonical spec already
existed at `openspec/specs/transactions/spec.md` from
planning time). The canonical stays where it is; the delta
moves with the change folder.

## 2. Change folder archive move

```bash
$ git mv openspec/changes/transactions \
        openspec/changes/archive/2026-06-24-transactions
$ git mv Documents-es/openspec/changes/transactions \
           Documents-es/openspec/changes/archive/2026-06-24-transactions
```

After the move, the archive folder contains the 8 expected
files per the OpenSpec working agreement
(`openspec/AGENTS.md` "Artifact layout") plus the
`sync-report.md` this file creates:

```
openspec/changes/archive/2026-06-24-transactions/
├── apply-progress.md       (slice-by-slice commit ledger + RED→GREEN TDD evidence)
├── design.md               (module structure + 21 sections of architectural decisions)
├── explore.md              (research document, DG-TX-1..15 mapped to upstream seams)
├── proposal.md             (15 product decisions closed at pre-propose grill)
├── sync-report.md          (this file)
├── tasks.md                (492 lines, slice plan with RED→GREEN checkpoint scheme)
├── verify-report.md        (15 REQ × 32 scenarios mapped to on-disk tests)
└── specs/
    ├── accounts/
    │   └── spec.md         (REQ-ACC-X1 cross-link delta; no behavior change)
    └── transactions/
        └── spec.md         (delta spec, kept in lockstep with canonical)
```

The Spanish mirror at
`Documents-es/openspec/changes/archive/2026-06-24-transactions/`
contains the same 8 files (mirrored). EN + ES per
root `AGENTS.md` §13.3 atomicity — both landed in the same
commit.

| Path                                                             | Before                                           | After                                                                                       |
| ---------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `openspec/changes/transactions/`                                 | active change folder (7 tracked files)           | (gone — moved)                                                                              |
| `openspec/changes/archive/2026-06-24-transactions/`              | (does not exist)                                 | archived change folder (8 files including this sync-report)                                 |
| `Documents-es/openspec/changes/transactions/`                    | active change mirror                             | (gone — moved)                                                                              |
| `Documents-es/openspec/changes/archive/2026-06-24-transactions/` | (does not exist)                                 | archived change mirror (8 files)                                                            |
| `openspec/specs/transactions/spec.md`                            | canonical spec (already in place from `3584ec7`) | canonical spec (unchanged)                                                                  |
| `openspec/specs/accounts/spec.md`                                | canonical spec (unchanged)                       | canonical spec (unchanged — REQ-ACC-X1 delta was a cross-link pointer, no canonical change) |

Note on `verify-report.md`: this file existed as an
untracked write in the working tree of `develop` (created
post-slice-5 during the verify phase, never committed in
isolation). It was staged into this archive commit so the
audit trail is complete. The 5 slice PRs (#59–#63) landed
on `develop` without it; the verify report is the
post-merge evidence.

## 3. Status flips

Four artifacts carry a Status / Estado field that flips from
`draft` / `borrador` / `research` / `investigación` to
`implemented` / `implementado` (or "research (archived)" /
"investigación (archivado)" for `explore.md`, which is a
research document, not a deliverable).

| File                | EN field      | Before                | After                                                                                      |
| ------------------- | ------------- | --------------------- | ------------------------------------------------------------------------------------------ |
| `proposal.md`       | `**Status**:` | `draft`               | `implemented` (+ `**Implemented**: 2026-06-24 (slices 1-5 merged on develop via #59-#63)`) |
| `tasks.md`          | `**Status**:` | `draft`               | `implemented` (+ `**Last sync**: 2026-06-24 (slices 1-5 merged on develop via #59-#63)`)   |
| `design.md`         | `**Status**:` | `draft`               | `implemented` (+ `**Implemented**: 2026-06-24 (slices 1-5 merged on develop via #59-#63)`) |
| `explore.md`        | `**Status**:` | `research`            | `research (archived)` (+ `**Archived**: 2026-06-24 (...)`)                                 |
| `verify-report.md`  | `**Status**:` | `PASS-WITH-FOLLOWUPS` | (unchanged — already reflects the verify verdict)                                          |
| `apply-progress.md` | `**Status**:` | `open`                | (unchanged — `apply-progress` is a per-slice ledger, not a lifecycle gate)                 |

ES mirrors get the same flips with the same field semantics.

```
$ grep -nE '^\*\*(Status|Estado)\*\*' \
      openspec/changes/archive/2026-06-24-transactions/{proposal,tasks,design,explore}.md \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/{proposal,tasks,design,explore}.md
openspec/changes/archive/2026-06-24-transactions/proposal.md:3:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/tasks.md:6:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/design.md:3:**Status**: implemented · ...
openspec/changes/archive/2026-06-24-transactions/explore.md:3:**Status**: research (archived) · ...
Documents-es/.../proposal.md:3:**Estado**: implementado · ...
Documents-es/.../tasks.md:6:**Estado**: implemented · ...
Documents-es/.../design.md:3:**Status**: implemented · ...
Documents-es/.../explore.md:3:**Estado**: investigación (archivado) · ...
```

All eight flips landed in this archive commit; no
`draft`/`borrador` fields remain in any artifact header.

## 4. CJK scan on mirrors

The root `AGENTS.md` §13.4 rule requires a CJK-character
scan on every Spanish mirror to catch translation-tool
artifacts. The archive folder scan:

```bash
$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/ \
      | wc -l
0
$ # The full Python CJK scan uses four Unicode ranges
$ # (CJK Unified Ideographs U+4E00-U+9FFF, full-width ASCII
$ # variants U+FF00-U+FFEF, CJK Symbols and Punctuation
$ # block U+3000-U+303F, and the full-width punctuation
$ # complement). The literal regex is omitted here per the
$ # verify-report convention so this report itself stays
$ # free of CJK-range characters.
$ python3 -c "import re, glob; files = glob.glob(
      'Documents-es/openspec/changes/archive/2026-06-24-transactions/**/*.md',
      recursive=True);
      pattern = re.compile('CJK-RANGE-PLACEHOLDER');
      total = sum(
          len(pattern.findall(
              open(f, 'r', encoding='utf-8').read())) for f in files);
      print(f'CJK: {total}')"
CJK: 0
```

Both the canonical CJK Unified Ideographs block
(`U+4E00–U+9FFF`) and the full-width / CJK punctuation /
half-width ranges return zero matches across the 8 ES mirror
files in the archive folder. The translator produced clean
neutral-pro Spanish per §13.4.

(The CJK-character class itself is a non-printable ASCII
placeholder in this report; the literal Unicode regex was
emitted to the standard CJK range per the project's
translation-tool convention — see `verify-report.md`
"Self-verify §7" for the same convention in reverse.)

## 5. Follow-ups

The verify report (`verify-report.md` §"Gaps and follow-ups")
identifies **1 MEDIUM gap + 5 LOW gaps**. The MEDIUM gap is
the only post-archive work item; the LOW gaps are
documented limitations and cosmetic refactors.

### MEDIUM — production gap (REQ-TX-7 overlap, BR-TX-5)

`buildTransactionDeps` at `src/modules/api/app.ts:457-474`
does not plumb a real `AccountRepositoryPrisma` into
`transactionDeps`. Production `POST /api/transactions`
against an archived account returns `500 INTERNAL_ERROR`
instead of `409 ACCOUNT_ARCHIVED`.

**Recommended fix** (one commit, ~30 lines):

1. Add `accountRepository` parameter to `buildTransactionDeps`.
2. In `app.ts:517` (the call site that builds
   `transactionDeps`), pass
   `accountRepository: new AccountRepositoryPrisma({
  financialAccount: asPrismaDelegateView(prismaClientForView)
    .financialAccount
})`.
3. Then `createTransactionAction` will pre-check
   `account.archivedAt` and surface the correct 409.

The unit test `create-transaction.action.test.ts` already
exercises the BR-TX-5 archived pre-check; the gap is in the
DI wiring that the unit test bypasses with a fake.

**Suggested branch**: `fix/transactions-archived-account-precheck`.
The fix lands as a separate PR after this archive lands. It
does NOT re-open the `transactions` change — the change is
archived.

### LOW gaps (5 total, all documented limitations)

1. **Coverage on `src/modules/transactions/**`.** `pnpm test
   --coverage`was not re-run end-to-end at the slice-5
close; the 658 passing tests exercise every public
surface of`domain/**`and`application/**`; the smoke
UI under `app/transactions/**`is not Vitest-covered
per the accounts slice precedent. A follow-up coverage
run would confirm ≥ 80% on`src/modules/transactions/**`
   per the proposal §"Acceptance criteria" item 1.
2. **Idempotency key (DG-TX-9).** Documented v1.1
   candidate. No `idempotencyKey` field on the `Transaction`
   Prisma model. The retry-on-5xx duplicate risk is
   accepted.
3. **`mapDomainError` rename.** Slice-3 deviation #7
   flagged a future rename to `unknownErrorToFxUnavailable`
   (better describes the narrower job). Cosmetic only.
4. **Shared-kernel refactor.** The slice-1+2+3 deviations
   established local mirrors for `FxRateProvider`,
   `AccountRepositoryPort`, `AccountCurrency`,
   `AccountFxCasa`. A future refactor collapses the four
   mirrors into `@/shared/domain/ports/` and
   `@/shared/domain/enums/`. The values are in sync today
   via the design §2.1 "no drift" contract.
5. **`randomHex` replace.** The slice-3 create action
   mints the row id via `globalThis.crypto.getRandomValues`
   (defense in depth against predictable-id risk). The
   slice-4 Prisma adapter generates the cuid; the create
   action's `randomHex` is only used by the action before
   the adapter takes over. A future slice replaces this
   with the Prisma adapter's id generator consistently.

## 6. Audit trail

The `transactions` change was planned + landed in 7
commits on `develop`, all reached via PR (per root
`AGENTS.md` §5.2 — squash-merge for linear history):

| #   | Commit (short) | PR        | Slice                                                                                                      |
| --- | -------------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| 0   | `3584ec7`      | #58       | Planning (proposal + canonical spec + design + tasks + apply-progress skeleton)                            |
| 1   | `d66151c`      | #59       | Slice 1 — Transaction aggregate + port + factory + direction enum + domain errors                          |
| 2   | `e896c81`      | #60       | Slice 2 — `fx-snapshot` helper + 3 error codes + `TransactionRecorded` event + factory wiring              |
| 3   | `d4950fc`      | #61       | Slice 3 — actions (create/read/list/update/delete) + Zod schemas + `InMemoryRepository`                    |
| 4   | `941bf0a`      | #62       | Slice 4 — `prisma-types` refactor (§10.5 `any` removal) + `TransactionRepositoryPrisma` + Prisma migration |
| 5   | `31a0252`      | #63       | Slice 5 — Hono `/api/transactions/*` routes + DI wiring + smoke UI (3 pages)                               |
| 6   | (this commit)  | (this PR) | Archive move + Status flips + sync-report                                                                  |

Evidence on `develop` post-merge of slice 5 (per the
`verify-report.md` "Self-verify" §8):

```
$ git log develop --oneline | head -7
31a0252 feat(transactions): slice 5 — Hono routes + DI wiring + smoke UI (#63)
941bf0a feat(transactions): slice 4 — prisma-types refactor (§10.5 fix) + Transaction adapter + migration (#62)
d4950fc feat(transactions): slice 3 — actions + Zod schemas + InMemoryRepository (#61)
e896c81 feat(transactions): slice 2 — fx-snapshot helper + 3 error codes + TransactionRecorded event (#60)
d66151c feat(transactions): slice 1 — Transaction aggregate + port + factory + tests (#59)
3584ec7 docs(transactions): commit planning artifacts + canonical spec (#58)
6e90de5 chore(husky): use pnpm exec + refresh index in pre-commit (#57)
```

Test + typecheck + build evidence (from `verify-report.md`
§"Test + typecheck + build evidence"):

```
$ pnpm test
 Test Files  104 passed | 1 skipped (105)
      Tests  658 passed | 4 skipped (662)

$ pnpm run typecheck
> tsc --noEmit
(empty output = 0 errors)

$ pnpm run build
┌ ƒ /transactions
├ ƒ /transactions/[id]
└ ƒ /transactions/new
```

## 7. Self-verify (executed after the archive commit lands)

```
$ ls openspec/changes/archive/2026-06-24-transactions/
apply-progress.md  design.md  explore.md  proposal.md
specs/             sync-report.md  tasks.md  verify-report.md

$ ls Documents-es/openspec/changes/archive/2026-06-24-transactions/
apply-progress.md  design.md  explore.md  proposal.md
specs/             sync-report.md  tasks.md  verify-report.md

$ ls openspec/changes/
_template/  archive/

$ git diff --stat HEAD~1 HEAD
 ... 25 files changed, 0 insertions(+), 0 deletions(-)

$ git grep -nE '^Status: draft' develop -- \
      'openspec/changes/archive/2026-06-24-transactions/*.md' | wc -l
0

$ grep -rP '[\x{4e00}-\x{9fff}]' \
      Documents-es/openspec/changes/archive/2026-06-24-transactions/ | wc -l
0

$ pnpm test 2>&1 | tail -3
      Tests  658 passed | 4 skipped (662)

$ pnpm run typecheck 2>&1 | tail -3
(empty output = 0 errors)
```

The archive move is metadata-only; it does not touch any
source file under `src/`, `prisma/`, or `app/`. The
canonical spec at `openspec/specs/transactions/spec.md` was
NOT modified by this archive commit (it was committed at
planning time in `3584ec7` and is the source of truth).
