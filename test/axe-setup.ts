/**
 * Vitest setup for axe-core a11y assertions (REQ-UI-4..8).
 *
 * vitest-axe extends Vitest's `expect` with `toHaveNoViolations`,
 * which the per-primitive a11y contract tests use to assert
 * that the rendered primitive passes axe-core's `critical` and
 * `serious` checks at WCAG 2.2 AA.
 *
 * Slice 5 (`ui-integration-tests`) extends this setup to wire
 * the page-level axe checks for `/accounts`, `/transactions`,
 * and `/dashboard`.
 */

import 'vitest-axe/extend-expect';
