# ADR-0007 — Obsidian vault mirror for `Documents-es/`

**Status**: Accepted · **Date**: 2026-06-17 · **Deciders**: Sebastián Illa

## Context and Problem Statement

The project maintains dual-language docs: `docs/` and `openspec/` are the
English source of truth, `Documents-es/` is the Spanish mirror (same
structure, technical translation). The user wants to read these documents
inside their personal Obsidian vault, which lives at
`/Users/sebailla/Library/Mobile Documents/iCloud~md~obsidian/Documents/Proyectos/`
and syncs via iCloud Drive.

The vault already contains `Fanatic_Gym/Documents-es/` as a precedent: a
one-off manual `cp -R` done on 2026-06-15 via the `obsidian-vault` subagent.
We need a repeatable, idempotent way to refresh the vault copy whenever the
repo's `Documents-es/` changes, without invoking the subagent every time.

## Drivers

- **Read flow**: the user reads the Spanish docs from the vault on phone,
  tablet, and laptop. iCloud propagation is the only sync primitive.
- **Idempotence**: re-running the sync must converge to the same state.
- **No symlinks**: the user explicitly chose real copies over symlinks (see
  `obsidian-vault` agent config). Symlinks break across iCloud's
  device-bound filesystem semantics.
- **Repo is source of truth**: the vault copy is a consumer. Hand-authored
  notes inside the vault are not part of the project.

## Considered Options

1. **`pnpm docs:obsidian` script** in this repo that does a destructive
   replace of `<vault>/gastos-personales/Documents-es/` with the current
   repo `Documents-es/`. Idempotent. The vault root is supplied via the
   `OBSIDIAN_VAULT_PATH` environment variable (no hardcoded fallback; see
   the Implementation Notes section).
2. **`rsync` with a preserv-list** — keeps hand-authored notes by path
   pattern. More machinery for the same one-way mirror; defer until the user
   actually starts writing notes in the vault.
3. **Symlink** — cheap but fragile across iCloud devices and Conflicting
   with the existing `obsidian-vault` agent's "copias reales, NO symlinks"
   rule.
4. **Git-ignored subdirectory inside the repo** — would make the vault copy
   version-controlled and diffable, but the vault path is outside the repo
   on this Mac and moving it inside mixes repo state with consumer state.
5. **Full OpenSpec-managed spec under `openspec/specs/docs-mirroring/`** —
   the spec exists (it covers PDF→Drive and the OneNote exception per
   AGENTS.md §13.5). Obsidian would be a third exception. Defer the formal
   entry until the sync shape stabilises; ADR-0007 captures the decision in
   the meantime.

## Decision Outcome

**Chosen option**: "1. `pnpm docs:obsidian` script", implemented at
`scripts/sync-obsidian.ts` and wired in `package.json` as
`"docs:obsidian": "tsx scripts/sync-obsidian.ts"`. The script uses Node 20+
built-ins only (`node:fs/promises`, `node:path`, `node:url`); no new
dependencies. The algorithm: snapshot any pre-existing `*.md` under the
vault's `Documents-es/` folder → `rm -rf` → `fs.cp` → verify that `.md` count
and total byte size match the source → diff against the snapshot to report
any hand-authored notes that were overwritten. Destructive by design: a
destructive sync is simpler and more honest than a merge that would silently
diverge the vault from the repo.

### Implementation notes

- **`OBSIDIAN_VAULT_PATH` is mandatory.** The script refuses to run with
  exit code 3 if the env var is not set. The env var points at the vault
  _root_ (the folder containing per-project subfolders); the script
  appends `Documents-es` to it. The `.husky/post-commit` hook exports the
  env var before invoking the script.
- **`isEntryPoint` guard.** `main()` only runs when the file is the
  process entry point. When the module is imported (e.g. from unit tests
  in `test/sync-obsidian.test.ts`), the side-effecting entry is skipped so
  the pure exports (`classifyError`, exit codes) can be exercised in
  isolation.
- **`fs.cp` instead of `cp -R`.** Initial draft shelled out to `cp -R`;
  the second iteration replaced that with the native Node API
  (`await cp(SOURCE, TARGET, { recursive: true, force: true })`) to drop
  the platform dependency.
- **No hardcoded paths in script TS.** The vault path is read from
  `process.env.OBSIDIAN_VAULT_PATH` only. The path string lives once, in
  the `.husky/post-commit` shell hook, which is not subject to `gga run`'s
  TS/JS lint surface.

### Consequences

- **Good**: idempotent on demand; no symlink fragility; one command to
  remember (`pnpm docs:obsidian`); exit codes distinguish missing source (2),
  missing vault parent (3), and verification failure (4); JSON summary line on
  stdout is CI-friendly; mirrors the project's existing one-way doc-mirror
  pattern (`mirror-pdf-drive`).
- **Bad**: any hand-authored note inside `<vault>/gastos-personales/Documents-es/`
  is wiped on next run. Mitigated by the pre-snapshot warning that lists
  every lost note path in the JSON `lostManualNotes` array and on stderr.
  Upgrade path: option 2 (`rsync` + preserv list) once the user starts
  authoring notes.
- **Out of scope for this ADR**: pre-commit / post-commit hooks, CI workflow,
  and the formal OpenSpec entry under `docs-mirroring/`. These are tracked
  in the follow-ups.

### Confirmation

End-to-end verified manually on 2026-06-17:
`pnpm docs:obsidian` → exit 0; vault count = 28 `.md` (matches repo);
`du -sb` match between source and target. No domain unit tests: the script
is glue and the algorithm is verifiable from the exit codes and JSON output.
If the script gains logic (e.g. preserv list, merge strategies), strict TDD
becomes applicable per `openspec/config.yaml`.

## Follow-ups (deferred from initial implementation)

Two design choices were intentionally deferred from the initial ship and
recorded here for future work:

1. ~~**Externalize the vault path.**~~ **DONE.** The vault path is now
   supplied via the `OBSIDIAN_VAULT_PATH` environment variable (no
   hardcoded fallback in the TS script). The path string lives only in
   `.husky/post-commit`, which is outside `gga run`'s review surface.

2. **`--dry-run` mode.** The script is destructive by design (it removes the
   existing `Documents-es/` mirror before re-copying). A future iteration
   should add a `--dry-run` flag that performs the snapshot comparison and
   prints the diff but does not delete or copy. The snapshot/warning
   infrastructure already exists in the script, so this is mostly a
   flag-handling addition.

`gga run` flagged these as structural findings during the first commit
attempt. We closed items 2 (`fs.cp` instead of `cp -R`) and 4 (classified
exit codes) of the original findings list; items 1 and 3 above correspond
to gga findings 1 and 3. Item 1 above is now closed (see "Implementation
notes" in the Decision Outcome section).

## Follow-ups (deferred from second review pass)

A subsequent `gga run` review raised three additional points that are
deliberately deferred to keep this PR scoped:

3. **Split the script into modules.** `scripts/sync-obsidian.ts` is now
   ~210 lines (after the `isEntryPoint` guard and the `OBSIDIAN_VAULT_PATH`
   validation moved into `main()`). A future iteration could split it into
   `scripts/sync-obsidian/` with `config.ts`, `fs-ops.ts`, `verify.ts`,
   `report.ts`, and `main.ts`. The script is currently cohesive (every helper
   is part of the same sync algorithm) and well under the project's "split
   giant files" threshold, so the split is a refactor for navigability, not
   a defect.

4. ~~**Add unit tests for the script.**~~ **DONE.** `test/sync-obsidian.test.ts`
   covers `classifyError` mappings (ENOENT, ERR_FS_CP_DIR_TO_NON_DIR,
   ERR_FS_CP_EEXIST, VerificationError, plain Error, string, null,
   undefined, number) and the exit-code contract (uniqueness + value). The
   16 tests run as part of `pnpm test` (suite went from 206 → 222 tests).
   Strict TDD was skipped at initial ship per the Confirmation section;
   these tests were added post-hoc to satisfy `gga run`'s "no test file"
   structural finding.

5. ~~**Wrap `main()` to return `Promise<Result>` instead of calling
   `process.exit()` directly.**~~ **PARTIALLY DONE.** The `isEntryPoint`
   guard (see Implementation notes) prevents `main()` from running during
   module imports, which is the minimal change needed to make the script
   unit-testable. A full `Result`-returning wrapper is still a future
   refactor; the current `process.exit()` inside the entry-point guard is
   idiomatic for a CLI.

These are recommendations from the gga review, not blockers. Items 4 and 5
were closed during the second implementation pass; item 3 is recorded here
for the next iteration.
