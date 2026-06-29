/**
 * Vitest setup for the axe-core a11y integration suite — slice 5
 * (`feat/ui-integration-tests`, design §13.4).
 *
 * The `tests/a11y/*.test.tsx` files render the production pages
 * end-to-end (Server Components + their Client Component
 * children) and assert that `axe(container)` reports ZERO
 * violations at the WCAG 2.2 AA `critical` or `serious` impact
 * levels. `moderate` and `minor` violations are logged but do not
 * block the verify gate (they are non-blocking follow-ups; the
 * design §13.4 contract only blocks `critical + serious`).
 *
 * The helper is intentionally NOT a custom Vitest matcher — the
 * existing `vitest-axe` matcher (`toHaveNoViolations`) is already
 * registered globally in `test/axe-setup.ts`. The page-level
 * suite prefers the more granular `filterByImpact` flow so it can
 * log `moderate`/`minor` for visibility without failing the run.
 *
 * Why this lives in `tests/a11y/setup.ts` instead of the
 * repo-root `test/axe-setup.ts`:
 * - The repo-root `test/axe-setup.ts` is GLOBAL state — every
 *   Vitest process loads it. The slice-2/3/4 per-component
 *   a11y contract tests use the `toHaveNoViolations` matcher
 *   registered there (legacy slice-2/chore convention).
 * - The slice-5 page-level suite needs a more granular helper
 *   (`expectNoCriticalOrSerious`) because the per-page audit
 *   surface is much larger than a single primitive; we want to
 *   log `moderate`/`minor` for the orchestrator's later triage
 *   without breaking the verify gate on them.
 *
 * The helper is exported + consumed directly by the page-level
 * tests; it does NOT register any global matcher state.
 */

import type { Result as AxeResult, NodeResult } from 'axe-core';

/**
 * The minimum severity the slice-5 verify gate blocks on.
 * Per design §13.4: "The assertion fails on any `critical` or
 * `serious` violation. `moderate` and `minor` are logged but not
 * blocking."
 */
export type AxeImpact = 'critical' | 'serious' | 'moderate' | 'minor';

/** Minimal shape we need from axe-core to filter/log violations. */
export interface AxeAuditResult {
  readonly violations: ReadonlyArray<AxeViolation>;
}

/** Minimal shape of a single axe-core violation. */
export interface AxeViolation {
  readonly id: string;
  readonly impact?: AxeImpact | null | undefined;
  readonly description?: string;
  readonly nodes?: ReadonlyArray<NodeResult>;
}

/**
 * Filter the axe-core results down to violations at the given
 * impacts. Returns `[]` when none match (so the call site can
 * assert with `toEqual([])`).
 */
export function filterByImpact(
  results: AxeAuditResult,
  impacts: ReadonlyArray<AxeImpact>,
): ReadonlyArray<AxeViolation> {
  const allowed = new Set(impacts);
  return results.violations.filter(
    (v): v is AxeViolation =>
      v.impact !== undefined && v.impact !== null && allowed.has(v.impact),
  );
}

/**
 * Return the blocking subset of the violations (so the call site
 * can `toEqual([])` on it). `moderate` + `minor` are logged for
 * the orchestrator's later triage.
 *
 * Usage in a test:
 *   const results = await axe(container);
 *   const blocking = expectNoCriticalOrSerious(results);
 *   expect(blocking).toEqual([]);
 */
export function expectNoCriticalOrSerious(
  results: AxeAuditResult,
): ReadonlyArray<AxeViolation> {
  const blocking = filterByImpact(results, ['critical', 'serious']);
  const informational = filterByImpact(results, ['moderate', 'minor']);
  if (informational.length > 0) {
    // eslint-disable-next-line no-console -- intentional: the
    // orchestrator (and CI) want to see the non-blocking
    // violation summary at the end of the run.
    console.info(
      `axe-core informational (moderate + minor, ${informational.length} items):`,
      informational
        .map((v) => `${v.id} (${v.impact ?? 'unknown'})`)
        .join(', '),
    );
  }
  return blocking;
}

/** Re-export `AxeResult` so callers can type-annotate their `axe()` returns. */
export type { AxeResult };
