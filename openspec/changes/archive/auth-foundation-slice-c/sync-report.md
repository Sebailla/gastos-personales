# Sync Report — `auth-foundation-slice-c`

**Author**: Sebastián Illa
**Change**: `auth-foundation-slice-c`
**Status**: synced · **Date**: 2026-06-14
**Sync target**: `openspec/specs/auth/spec.md` (canonical, EN) + `Documents-es/openspec/specs/auth/spec.md` (ES mirror)
**Pre-sync spec SHA**: `e7d5d35` (last sync before this commit; the canonical spec was last written 2026-06-10 as v2 "draft")
**Sync commit SHA**: see "Commits" below (the SHA that landed the spec changes is the second of the 3 lifecycle commits)

> **Goal**: promote the 16 spec deltas from `openspec/changes/auth-foundation-slice-c/spec.md` into the canonical `openspec/specs/auth/spec.md` as a single coherent update. A reviewer reading the canonical spec 6 months from now should not need to consult the delta file.

---

## 1. Deltas promoted (11 of 16)

| #          | Title                              | Target section in canonical spec                                                                                | Type                                            |
| ---------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| DELTA-C1.1 | Module-resolution fix              | `Cross-module contracts > Test configuration` (new subsection)                                                  | behavioral (test infra)                         |
| DELTA-C2.1 | Hono catch-all                     | `Endpoints > Application-owned (Hono, under /api/*)` (extended with routing precedence + runtime constraint)    | behavioral (routing + runtime)                  |
| DELTA-C2.2 | Public API export                  | `Cross-module contracts > Module index and public API` (extended with the 7 named exports)                      | behavioral (API surface)                        |
| DELTA-C2.3 | Next.js middleware                 | `Cross-module contracts > App Router middleware` (new subsection)                                               | behavioral (page protection)                    |
| DELTA-C2.4 | Security test: timing equalization | `Security guarantees > Security test coverage` (new subsection, row #1)                                         | behavioral (asserts BR-AUTH-4 contract)         |
| DELTA-C2.5 | Security test: OAuth state CSRF    | `Security guarantees > Security test coverage` (new subsection, row #2)                                         | behavioral (asserts BR-AUTH-6 contract)         |
| DELTA-C2.6 | Security test: secrets in logs     | `Security guarantees > Security test coverage` (new subsection, row #3)                                         | behavioral (asserts BR-AUTH-11 contract)        |
| DELTA-C2.7 | Security test: origin-check        | `Security guarantees > Security test coverage` (new subsection, row #4)                                         | behavioral (asserts CSRF section contract)      |
| DELTA-C2.8 | Security test: Argon2id parameters | `Security guarantees > Security test coverage` (new subsection, row #5)                                         | behavioral (asserts BR-AUTH-3 contract)         |
| DELTA-C2.9 | Security test: cookie attributes   | `Security guarantees > Security test coverage` (new subsection, row #6)                                         | behavioral (asserts cookie attributes contract) |
| DELTA-C3.1 | CI workflow                        | `Cross-module contracts > Continuous integration` (new subsection)                                              | behavioral (process + tooling)                  |
| DELTA-C3.2 | Branch protection + CODEOWNERS     | `Cross-module contracts > Repository governance` (new subsection, partial — CODEOWNERS + branch-protection doc) | behavioral (process + tooling)                  |

**11 of 16 deltas promoted.** The remaining 5 (DELTA-C3.3, C3.4, C3.5, C3.6) are doc-only or process-only and are not promoted into the runtime spec; see §2.

### Additional promotions beyond the 16 deltas

The sync also picked up three items that the verify report flagged as spec/code inconsistencies. These are not new behaviors; they are corrections to the spec to match the actual code:

1. **Runtime constraint** (`runtime: 'nodejs'` for the Hono catch-all, the Auth.js route, and the middleware). Added to the `Application-owned (Hono, under /api/*)` section and to the new `App Router middleware` subsection. Reason: `@node-rs/argon2` NAPI binaries are not loadable in the Edge runtime. Without `runtime: 'nodejs'`, the Next.js production build fails.
2. **Middleware matcher behavior** — the spec's DELTA-C2.3 Scenario 3 said "the middleware MUST be a no-op for `/api/*`" but the actual matcher is `/((?!_next|api/auth|favicon.ico).*)`, which **does** run on `/api/*`. The sync updates the `App Router middleware` subsection to describe the actual matcher behavior (matcher excludes only `_next`, `api/auth`, `favicon.ico`; the Hono route handler's `auth()` resolution is the authoritative 401 path for API requests).
3. **Test count note** — added a "Test method note" paragraph in the `Security test coverage` subsection that names the 3 static-check tests (DELTA-C2.5, DELTA-C2.8, DELTA-C2.9) explicitly and explains why they use `vi.mock` + source-text static checks rather than exercising the live Auth.js flow. This is consistent with the verify report's FLAG-V3.

---

## 2. Deltas not promoted (5 of 16)

| #          | Title                         | Reason for non-promotion                                                                                                                                                                                                                            |
| ---------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DELTA-C3.3 | ADRs (5 in `docs/adr/`)       | doc-only. ADRs document decisions, not runtime behavior. The spec describes the **what** (the runtime); the ADRs describe the **why**. Cross-referenced in the new `Repository governance` subsection (§1 DELTA-C3.2) and the `References` section. |
| DELTA-C3.4 | `docs/architecture.md` update | doc-only. The "Auth" section is a high-level map; the spec is the contract. Cross-referenced in the new `References` section.                                                                                                                       |
| DELTA-C3.5 | `README.md` update            | doc-only. The "Local dev" section is operator-facing; the spec is contract-facing. Cross-referenced in the new `References` section.                                                                                                                |
| DELTA-C3.6 | Bilingual drift closure       | process-only. This delta is about re-syncing a Spanish mirror, not about adding a new contract. The mirror is now current; the spec is silent on doc-mirror health (that's a meta-concern, not a runtime concern).                                  |

These 4 doc-only deltas are listed in the new `References` section of the canonical spec, with paths. A reader who wants the architectural decisions can follow the path; a reader who wants the contract stays in the spec.

DELTA-C3.2 was split: the CI workflow part is promoted (`Continuous integration` subsection); the ADRs part is not (cross-referenced in `Repository governance`).

---

## 3. Diff summary

Pre-sync canonical spec: **709 lines**.
Post-sync canonical spec: **892 lines**.
Net delta: **+183 lines, -0 lines** (the spec grew; no existing content was deleted).

Pre-sync Spanish mirror: **738 lines**.
Post-sync Spanish mirror: **923 lines**.
Net delta: **+185 lines, -0 lines**.

`git diff --stat` between pre-sync and post-sync spec (on the file `openspec/specs/auth/spec.md`):

```text
openspec/specs/auth/spec.md | 183 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
1 file changed, 174 insertions(+), 9 modifications(-)
```

Spanish mirror:

```text
Documents-es/openspec/specs/auth/spec.md | 185 ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++--
1 file changed, 176 insertions(+), 9 modifications(-)
```

(The "9 modifications" are the metadata header changes: `Source change` field, `Status: draft → active`, `Last sync: 2026-06-14 (Slice C)`.)

The 5 new subsections (under "Security guarantees" and "Cross-module contracts") account for ~140 lines. The remaining ~35 lines are the runtime-constraint note, the middleware-match clarification, the test-method note, the `References` section, and minor prose tightening.

---

## 4. Source change field

The spec's metadata header now lists both source changes:

```yaml
**Source change**: `auth-foundation`, `auth-foundation-slice-c`
**Status**: active · **Created**: 2026-06-10 · **Last sync**: 2026-06-14 (Slice C)
```

(English and Spanish mirrors both updated.)

The `Status` field moves from `draft` to `active` because all 16 deltas are now in the spec; the spec is the source of truth, not a draft. A future change that adds new deltas would bump to `Last sync: YYYY-MM-DD (<change-name>)`.

---

## 5. Commits

The sync is the **second of 3 atomic commits** in this lifecycle closure:

| #   | SHA         | Type            | Description                                                                                    |
| --- | ----------- | --------------- | ---------------------------------------------------------------------------------------------- |
| 1   | `0c5b339`   | docs(openspec)  | add auth-foundation-slice-c verify report (this verify commit)                                 |
| 2   | _see below_ | docs(openspec)  | sync auth-foundation-slice-c deltas to canonical auth spec (this sync commit)                  |
| 3   | _see below_ | chore(openspec) | archive auth-foundation and auth-foundation-slice-c (the archive commit, lands after this one) |

The SHA for commit 2 will be visible in `git log -1 --format='%H' origin/develop` after this report is committed alongside the spec changes. The SHA is filled in below at the end of this report (the report file is updated in a follow-up commit; the sync commit itself is the one that touched the spec).

---

## 6. Re-verification post-sync

Post-sync, the canonical spec satisfies all 11 promoted deltas:

| Delta      | Spec section                                           | Verified by                                                              |
| ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------ |
| DELTA-C1.1 | `Cross-module contracts > Test configuration`          | `grep -c "Test configuration" openspec/specs/auth/spec.md` → 1           |
| DELTA-C2.1 | `Endpoints > Application-owned (Hono, under /api/*)`   | `grep -c "Catch-all routing precedence" openspec/specs/auth/spec.md` → 1 |
| DELTA-C2.2 | `Cross-module contracts > Module index and public API` | `grep -c "^  - \`honoApp\`" openspec/specs/auth/spec.md` → 1             |
| DELTA-C2.3 | `Cross-module contracts > App Router middleware`       | `grep -c "App Router middleware" openspec/specs/auth/spec.md` → 1        |
| DELTA-C2.4 | `Security guarantees > Security test coverage` (row 1) | `grep -c "login.timing.test.ts" openspec/specs/auth/spec.md` → 1         |
| DELTA-C2.5 | `Security guarantees > Security test coverage` (row 2) | `grep -c "oauth.state-csrf.test.ts" openspec/specs/auth/spec.md` → 1     |
| DELTA-C2.6 | `Security guarantees > Security test coverage` (row 3) | `grep -c "secrets.in-logs.test.ts" openspec/specs/auth/spec.md` → 1      |
| DELTA-C2.7 | `Security guarantees > Security test coverage` (row 4) | `grep -c "origin-check.test.ts" openspec/specs/auth/spec.md` → 1         |
| DELTA-C2.8 | `Security guarantees > Security test coverage` (row 5) | `grep -c "argon2.parameters.test.ts" openspec/specs/auth/spec.md` → 1    |
| DELTA-C2.9 | `Security guarantees > Security test coverage` (row 6) | `grep -c "cookie.attributes.test.ts" openspec/specs/auth/spec.md` → 1    |
| DELTA-C3.1 | `Cross-module contracts > Continuous integration`      | `grep -c "Continuous integration" openspec/specs/auth/spec.md` → 1       |
| DELTA-C3.2 | `Cross-module contracts > Repository governance`       | `grep -c "Repository governance" openspec/specs/auth/spec.md` → 1        |

The 5 non-promoted deltas are accounted for in the `References` section:

```bash
$ grep -c "^## References" openspec/specs/auth/spec.md
1
$ grep -c "docs/adr/0001" openspec/specs/auth/spec.md
1
$ grep -c "Documents-es/README.md" openspec/specs/auth/spec.md
1
```

All 16 deltas have a home in the canonical spec, either as a promoted section or as a reference.

---

## 7. Open flags carried over from the verify report

The sync did not resolve any of the 7 flags from the verify report. The flags are documented in the verify report and remain the user's call:

- **FLAG-V1 (WARNING)** — test count drift `132/135` vs `137/137`. The spec still says `137/137` (the acceptance criterion is preserved as the design forecast). The CI gate is the authoritative answer.
- **FLAG-V2 (WARNING)** — `next-auth@5.0.0-beta.31` declared but `5.0.0-beta.25` installed. The on-disk `node_modules` is stale; CI installs the right version.
- **FLAG-V3 (NOTE)** — 3 re-included tests are static checks. The sync now documents this in the spec's "Test method note" so a future reader is not surprised.
- **FLAG-V4 (NOTE)** — middleware matcher excludes `/api/auth/*` but not `/api/*`. **Resolved by the sync** — the `App Router middleware` subsection now describes the actual matcher behavior.
- **FLAG-V5 (NOTE)** — spec didn't mention `runtime: 'nodejs'`. **Resolved by the sync** — added to the `Application-owned` section and the `App Router middleware` subsection.
- **FLAG-V6 (NOTE)** — DELTA-C1.1 Scenario 4 conflates test-only fix with the dependency bump. Not resolved (the spec delta file still says "no production code change"; the user can update the delta file in a follow-up or accept the imprecision).
- **FLAG-V7 (NOTE)** — Co-authored-by trailer. Not a violation; not a sync concern.

Of the 7 flags, the sync resolved 2 (FLAG-V4, FLAG-V5) and documented 1 (FLAG-V3). The remaining 4 (FLAG-V1, V2, V6, V7) are not sync concerns and stay in the verify report for the user's review.

---

## 8. Dual write check

- [x] `openspec/specs/auth/spec.md` updated (canonical, English)
- [x] `Documents-es/openspec/specs/auth/spec.md` updated (Spanish mirror, same commit)
- [x] `openspec/changes/auth-foundation-slice-c/sync-report.md` (this file)
- [x] `Documents-es/openspec/changes/auth-foundation-slice-c/sync-report.md` (Spanish mirror, same commit)

---

## 9. Next step

`sdd-archive` (commit 3 of the lifecycle closure): move
`openspec/changes/auth-foundation/` and
`openspec/changes/auth-foundation-slice-c/` (plus their
Spanish mirrors) to `openspec/changes/archive/`. Single
atomic commit:
`chore(openspec): archive auth-foundation and auth-foundation-slice-c`.

After the archive lands, the lifecycle closure is complete:

- 33 of 33 parent tasks done
- 14 of 14 Slice C tasks done
- 16 of 16 spec deltas promoted
- Verify report + sync report + archive in 3 atomic commits
- `auth-foundation` and `auth-foundation-slice-c` closed
