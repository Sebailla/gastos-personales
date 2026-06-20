/**
 * Port: Clock.
 *
 * A minimal time abstraction so domain services can
 * be tested deterministically. The default production
 * implementation (`systemClock` in `./system-clock.ts`)
 * delegates to `new Date()`; tests pass a `fixedClock`
 * (see test files) to freeze time.
 *
 * Per the `architecture-standards` skill, every
 * domain service that reads the current time MUST
 * depend on `Clock` (not call `new Date()` directly).
 * The only place `new Date()` is allowed to leak
 * is the production `systemClock` implementation.
 *
 * The shape is intentionally one-method; if a service
 * needs a different granularity (timestamp, ISO
 * string, etc.) it can wrap `clock.now()` itself
 * rather than expanding this port.
 */

export interface Clock {
  /** Current wall-clock time as a `Date`. */
  now(): Date;
}
