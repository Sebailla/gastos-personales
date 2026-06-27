# Apply Progress — `reports` (slice 4 of 4: `dashboard-ui`)

**Author**: Sebastián Illa
**Change**: `reports`
**Mode**: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR)
**Slice**: 4 of 4 (dashboard-ui, feat/reports-4-dashboard-ui)
**Branch base**: `develop` (post-merge of slices 1, 2, 3 — #76/#77/#78/#79/#80 + #81 I-RPT-3.1 + #82 husky fix)
**Started**: 2026-06-27
**Completed**: 2026-06-27

---

## Goal

Land the smoke UI per design §9.2: three presentational Server
Components (`MonthlySummaryCard`, `CategoryBreakdownCard`,
`AccountFlowCard`) + the dashboard RSC page
(`app/dashboard/page.tsx`) with the empty-state CTA. The dashboard
does NOT deep-link to the flow endpoint in v1 — the `flow` card
is always empty until a future change adds the account picker.

After slice 4 the `reports` capability is complete on the wire
side; the orchestrator then runs `sdd-verify` and `sdd-sync`
(canonical spec at `openspec/specs/reports/spec.md`) and
`sdd-archive`.

---

## Completed Tasks (slice 4 — 8/8)

| ID        | Title                                                       | Commit                              | RED/GREEN Evidence                                                                                                                                               |
| --------- | ----------------------------------------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-RPT-301 | RED: `report-types.ts` test asserts wire shapes             | `8d12274` (combined with T-RPT-302) | RED: `Error: Failed to load url ./report-types` (namespace import forces runtime resolution; esbuild erases `import type`)                                       |
| T-RPT-302 | GREEN: `report-types.ts` (DTO mirror for RSC)               | `8d12274`                           | GREEN: 8/8 wire-shape assertions pass                                                                                                                            |
| T-RPT-303 | RED → GREEN: `MonthlySummaryCard` snapshot                  | `0114ab2`                           | RED: `Error: Failed to load url ./dashboard-monthly-summary`; GREEN: 2/2 snapshots pass                                                                          |
| T-RPT-304 | RED → GREEN: `CategoryBreakdownCard` snapshot               | `a749ba2`                           | RED: `Error: Failed to load url ./dashboard-category-breakdown`; GREEN: 2/2 snapshots pass                                                                       |
| T-RPT-305 | RED → GREEN: `AccountFlowCard` snapshot (always empty v1)   | `bf0cbe7`                           | RED: `Error: Failed to load url ./dashboard-account-flow`; GREEN: 1/1 snapshot passes; gga required dropping the unused `flow` prop (Surgical / Simplicity rule) |
| T-RPT-306 | RED: `app/dashboard/page.test.tsx` + `page.seeded.test.tsx` | `44b2246`                           | RED: `Error: Failed to load url ./page`; GREEN: 2/2 snapshots pass after T-RPT-307 landed                                                                        |
| T-RPT-307 | GREEN: `app/dashboard/page.tsx` RSC                         | `fdc46de`                           | GREEN: 2/2 snapshots pass; local Zod schemas for response validation (§10.5 Input validation)                                                                    |
| T-RPT-308 | DOCS: surface "(UTC)" label + CTA doc comment               | `4835de1`                           | Inline comments on each card + the CTA target; no behaviour change                                                                                               |

---

## Files Changed (slice 4)

| File                                                    | Action   | LoC      |
| ------------------------------------------------------- | -------- | -------- |
| `app/_lib/report-types.ts`                              | Created  | 86       |
| `app/_lib/report-types.test.ts`                         | Created  | 166      |
| `app/_components/dashboard-monthly-summary.tsx`         | Created  | 87       |
| `app/_components/dashboard-monthly-summary.test.tsx`    | Created  | 73       |
| `app/_components/dashboard-category-breakdown.tsx`      | Created  | 88       |
| `app/_components/dashboard-category-breakdown.test.tsx` | Created  | 97       |
| `app/_components/dashboard-account-flow.tsx`            | Created  | 43       |
| `app/_components/dashboard-account-flow.test.tsx`       | Created  | 32       |
| `app/dashboard/page.tsx`                                | Created  | 192      |
| `app/dashboard/page.test.tsx`                           | Created  | 93       |
| `app/dashboard/page.seeded.test.tsx`                    | Created  | 114      |
| `openspec/changes/reports/tasks.md`                     | Modified | +10, -10 |

Total: 1077 insertions across 11 files. Per-commit LoC stays
inside the 200-320 LoC budget per commit (75-252 insertions).
Slice total is over the per-slice 200-320 forecast because the
snapshot tests are sizeable; the orchestrator will surface the
actual `git diff --stat` per the work-unit-commits contract.

---

## TDD Cycle Evidence

| Task      | RED verified?                                             | GREEN verified?             | Refactor?                                                                    |
| --------- | --------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| T-RPT-301 | Yes (`Failed to load url ./report-types`)                 | Yes (8/8)                   | No                                                                           |
| T-RPT-303 | Yes (`Failed to load url ./dashboard-monthly-summary`)    | Yes (2/2)                   | No                                                                           |
| T-RPT-304 | Yes (`Failed to load url ./dashboard-category-breakdown`) | Yes (2/2)                   | No                                                                           |
| T-RPT-305 | Yes (`Failed to load url ./dashboard-account-flow`)       | Yes (1/1)                   | gga forced drop of unused `flow` prop (§10.5 Surgical)                       |
| T-RPT-306 | Yes (`Failed to load url ./page`)                         | Yes (2/2 across both files) | gga forced split of empty/seeded into two files (no shared `currentFixture`) |
| T-RPT-307 | n/a (depends on T-RPT-306)                                | Yes (2/2)                   | gga forced Zod parsing of response bodies (§10.5 Input validation)           |

---

## Verification

```bash
$ pnpm typecheck
> tsc --noEmit
(exit 0, no errors)

$ pnpm test app/_components/dashboard-*.test.tsx app/dashboard/
 Test Files  5 passed (5)
      Tests  7 passed (7)

$ pnpm test
 Test Files  132 passed | 1 skipped (133)
      Tests  805 passed | 4 skipped (809)
   Duration  4.26s

$ pnpm test:coverage:enforced
 All files          |    96.5 |    90.99 |   83.46 |    96.5 |
(All thresholds ≥ 80% satisfied)

$ pnpm build
(exit 0; /dashboard registered as `ƒ (Dynamic)`)
```

---

## Deviations from Design

### 1. Two dashboard page tests instead of one

The task description suggests a single `page.test.tsx` with empty

- seeded snapshot cases. The first draft used a shared mutable
  `currentFixture` selector to switch between cases in one file.
  gga flagged this as "stateful test logic" (§10.5 No logic in
  tests) and required splitting the cases into two files
  (`page.test.tsx` + `page.seeded.test.tsx`). Each file has its
  own pure, declarative mock factory (path-prefix lookup table).
  No behaviour change; cleaner contract per the reviewer's strict
  reading.

### 2. Local Zod schemas for response validation

The task description does not mention Zod parsing in the page;
the precedent in `app/transactions/page.tsx` uses a TypeScript
`as TransactionsListResponse` cast. The first draft did the same.
gga flagged the `as` cast as §10.5 "Input validation" violation
(compile-time only, no runtime check). Fix: declare local Zod
schemas (`monthlySummaryResponseSchema`,
`categoryBreakdownResponseSchema`, `errorEnvelopeSchema`) next
to the page and `.parse(await res.json())` instead of casting.
The schemas mirror `app/_lib/report-types.ts` verbatim — the UI
cannot import from `src/modules/reports/...` (architecture rule),
so the wire contract is hand-maintained next to the page; drift
between the DTO mapper and the page schemas now surfaces as a
Zod parse error, not a silent type mismatch.

### 3. AccountFlowCard signature simplified

The first draft accepted a `flow: AccountFlowDTO` prop and used
`void _flow;` to suppress the unused-var warning, justifying it
as "future-proofing for the account picker". gga flagged this as
§10.5 "Surgical: only change what's necessary" / "Simplicity"
violation — orphaned code masked as future-proofing. Fix: drop
the `flow` prop from `Props` in v1; the picker change re-adds
it when it lands. The page does NOT call the flow endpoint in v1
(design §9.2), so the prop was dead at this commit anyway.

### 4. Dashboard copy is Spanish per tasks.md §Slice 4

The task description specifies Spanish UI copy ("Registrar
primera transacción", "Resumen mensual", etc.). The page header
keeps the universal English `<h1>Dashboard</h1>` and the `(UTC)`
marker; the body copy is Spanish. Documented the locale
decision in the page header docblock.

---

## Issues Found

None. The slice-3 I-RPT-3.1 fix (commit `38a8083`) was already
on `develop` before this slice started; slice 4 is purely
additive (new files in `app/`).

---

## Verification Artifacts

- `pnpm typecheck` → exit 0
- `pnpm test` → 805/805 passed, 4 skipped (DB testcontainers)
- `pnpm test:coverage:enforced` → 96.5% lines / 90.99% branches / 83.46% functions / 96.5% statements (all ≥ 80%)
- `pnpm build` → exit 0; `/dashboard` registered as `ƒ (Dynamic)` after seeding a dummy `.env` from `.env.example`
- `gga run` → all 8 commits passed (cached or fresh)
- `git log --oneline origin/develop..feat/reports-4-dashboard-ui`:

```
201f4b1 chore(reports): mark slice 4 tasks complete in tasks.md
4835de1 docs(dashboard-ui): surface (UTC) label on each card + CTA doc comment
fdc46de feat(dashboard-ui): app/dashboard/page.tsx RSC with three-card grid + empty CTA
44b2246 test(dashboard-ui): dashboard page empty + seeded snapshot tests
bf0cbe7 feat(dashboard-ui): account flow card empty snapshot (v1 does not deep-link)
a749ba2 feat(dashboard-ui): category breakdown card with empty + populated snapshots
0114ab2 feat(dashboard-ui): monthly summary card with empty + populated snapshots
8d12274 feat(dashboard-ui): report-types wire shapes
```

8 commits on `feat/reports-4-dashboard-ui`.

---

## Status

**8/8 slice-4 tasks complete.** Ready for `sdd-verify`.

- `pnpm dev` smoke check pending (orchestrator-side; the page is
  covered by the snapshot tests + the in-process Hono route
  integration tests in slice 3). The `manual end-to-end` block
  in tasks.md §Slice 4 verification gate (sign in → /dashboard
  empty → CTA → /transactions/new → submit → land on
  /transactions → back to /dashboard populated) requires a real
  dev server + Postgres + an authenticated browser; the agent
  cannot exercise it.
- Spanish mirror of `apply-progress.md` is required per
  AGENTS.md §13. The orchestrator (or a follow-up slice) is
  responsible for `Documents-es/openspec/changes/reports/apply-progress.md`;
  the apply worker landed the English source only.
