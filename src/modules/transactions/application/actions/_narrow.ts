/**
 * Type-narrowing helpers for action test assertions.
 *
 * ActionResult is a discriminated union: `{ ok: true, value } | { ok: false, error }`.
 * TypeScript narrows correctly on `if (result.ok)`, but the narrowing
 * does not persist across separate `expect()` calls (each call is a
 * fresh expression). These helpers let the test assert on the
 * discriminated fields without losing the narrow.
 *
 * Local copy — slice 3 binding. The accounts module has its own
 * copy at `src/modules/accounts/application/actions/_narrow.ts`
 * (the modules-isolated rule, root AGENTS.md §10.5, prevents a
 * cross-module import).
 */

import type { ActionResult, ActionSuccess, ActionFailure } from './_shared';

export function assertOk<T>(result: ActionResult<T>): asserts result is ActionSuccess<T> {
  if (!result.ok) {
    throw new Error(
      `Expected ActionResult.ok === true, got false (error=${JSON.stringify(result.error)})`,
    );
  }
}

export function assertFail<T>(result: ActionResult<T>): asserts result is ActionFailure {
  if (result.ok) {
    throw new Error('Expected ActionResult.ok === false, got true');
  }
}
