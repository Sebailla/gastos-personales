/**
 * systemClock — the production `Clock` implementation.
 *
 * Delegates to `new Date()`. The ONLY place in the
 * codebase that calls `new Date()` for a domain time
 * stamp; every other layer goes through the `Clock`
 * port (see `clock.port.ts`).
 *
 * Kept as a plain object (not a class) so the import
 * is a single `import { systemClock } from ...` and
 * the wiring sites stay tiny. The shape conforms to
 * the `Clock` interface; no extra methods here.
 */

import type { Clock } from './clock.port';

export const systemClock: Clock = {
  now: () => new Date(),
};
