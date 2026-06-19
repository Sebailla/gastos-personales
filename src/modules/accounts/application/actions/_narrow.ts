/**
 * Type-narrowing helpers for action test assertions.
 *
 * ActionResult is a discriminated union: `{ ok: true, data } | { ok: false, status, error }`.
 * TypeScript narrows correctly on `if (result.ok)`, but the narrowing
 * does not persist across separate `expect()` calls (each call is a
 * fresh expression). These helpers let the test assert on the
 * discriminated fields without losing the narrow.
 */

import type { ActionResult, ActionSuccess, ActionFailure } from './_shared';

export function assertOk<T>(result: ActionResult<T>): asserts result is ActionSuccess<T> {
  if (!result.ok) {
    throw new Error(
      `Expected ActionResult.ok === true, got false (status=${(result as ActionFailure).status}, code=${(result as ActionFailure).error.code})`,
    );
  }
}

export function assertFail<T>(result: ActionResult<T>): asserts result is ActionFailure {
  if (result.ok) {
    throw new Error('Expected ActionResult.ok === false, got true');
  }
}
