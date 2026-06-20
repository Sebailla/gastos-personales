/**
 * Domain entity: Session. Server-side row in the
 * `Session` table. Auth.js issues and revokes them;
 * the application NEVER writes to this table directly.
 *
 * The sliding-window extension (BR-AUTH-7) is also
 * Auth.js's responsibility.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const SESSION_UPDATE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface Session {
  readonly id: string;
  readonly sessionToken: string;
  readonly userId: string;
  readonly expires: Date;
}

/** A session is active iff `expires > now`. Pure, deterministic.
 *
 * `now` is required (no `new Date()` default) so the call
 * site owns the time source. Production code passes
 * `systemClock.now()`; tests pass a fixed `Date`.
 */
export function isSessionActive(expires: Date, now: Date): boolean {
  return expires.getTime() > now.getTime();
}
