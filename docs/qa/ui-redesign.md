# QA — `ui-redesign` — WCAG 2.2 AA contrast audit

> Author: Sebastián Illa
> Change: `openspec/changes/ui-redesign`
> Spec source: `openspec/changes/ui-redesign/specs/ui/spec.md` REQ-UI-21
> Status: stub — PR 1 of 5 chained slices; per-pair rows are filled in PR 5 (audit+docs) once the new glass tokens, theme variants, and chrome land.

This file is the authoritative contrast audit for the new visual surfaces shipped by `ui-redesign`. It is referenced by:

- `openspec/changes/ui-redesign/specs/ui/spec.md` REQ-UI-21 — every new pair on both themes is recorded here.
- `openspec/changes/ui-redesign/tasks.md` T-PR1-10 — this stub is created in PR 1 so later PRs have a landing page.
- The Vitest suite added in PR 5 (`tests/e2e/ui-redesign.spec.ts`) — Playwright + axe-core sweeps the new `/`, `not-found`, and `error` pages and cross-references the per-pair rows below.

## Per-pair contrast table (filled in PR 5)

| Pair                                      | Token fg        | Token bg          | light ratio | dark ratio | WCAG 2.2 AA | Notes |
| ----------------------------------------- | --------------- | ----------------- | ----------- | ---------- | ----------- | ----- |
| `--ui-fg` on `--ui-glass-bg`              | `--ui-fg`       | `--ui-glass-bg`   | TBD         | TBD        | required    |       |
| `--ui-fg-muted` on `--ui-glass-bg`        | `--ui-fg-muted` | `--ui-glass-bg`   | TBD         | TBD        | required    |       |
| `--ui-accent` on `--ui-glass-bg`          | `--ui-accent`   | `--ui-glass-bg`   | TBD         | TBD        | required    |       |
| Large heading on gradient substrate (`/`) | `--ui-fg`       | `--ui-gradient-*` | TBD         | TBD        | required    |       |

## How this file is filled

Per REQ-UI-21, every new visual pair introduced by the change must have its contrast measured on **both** the `light` and `dark` themes and the result recorded in the table above. The measurement methodology:

1. Render the pair on the target theme (light or dark) in JSDOM with the production tokens resolved.
2. Use `axe-core` (via `vitest-axe`) to read the computed `color` and `background-color` from the rendered DOM.
3. Compute the WCAG 2.2 contrast ratio with the standard formula:
   - `L = 0.2126 * R' + 0.7152 * G' + 0.0722 * B'` (relative luminance).
   - `ratio = (L_lighter + 0.05) / (L_darker + 0.05)`.
4. Pass criterion: ratio ≥ **4.5 : 1** for body text, ≥ **3 : 1** for large text (≥ 18.66 px bold or ≥ 24 px regular).
5. Record the raw ratio and the pass/fail in the table. Failing rows block PR 5 from being marked `Ready for verify`.

## Reduced-transparency audit

The `prefers-reduced-transparency: reduce` media query in `app/globals.css` (added in PR 2) replaces the glass `backdrop-filter: blur(...)` with a high-opacity solid. The audit confirms that the solid variant maintains ≥ 4.5 : 1 contrast on every glass surface.

## Reduced-motion audit

The `prefers-reduced-motion: reduce` media query in `app/globals.css` (added in PR 2) collapses all animations to 0.01 ms. This is recorded here for completeness even though it is not a contrast pair.

## Provenance

- Created in PR 1 (`feat/ui-redesign-foundation`) per T-PR1-10.
- Filled in PR 5 (`feat/ui-redesign-audit-docs`) per T-PR5-XX (TBD when PR 5 tasks are written).
- Mirrored to Spanish in `Documents-es/docs/qa/ui-redesign.md` per `AGENTS.md` §13.3.
