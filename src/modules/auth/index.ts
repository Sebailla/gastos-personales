/**
 * Public surface of the `auth` module. Other modules (and
 * the `app/` tree) import ONLY from this file. Nothing else
 * in the codebase reaches into the module's internals.
 *
 * Exports:
 * - `auth()` — the Auth.js v5 server-side helper.
 * - `signIn`, `signOut` — server actions for use in server
 *   components.
 * - `handlers` — `GET` / `POST` for `/api/auth/*`. Mounted
 *   at `app/api/auth/[...nextauth]/route.ts` in Slice B.
 * - The `UserRegistered` / `UserSignedIn` event-name
 *   constants for cross-module subscribers.
 */

export { auth, signIn, signOut, handlers } from './infrastructure/external/authjs';
export { UserRegistered, UserSignedIn } from '@/shared/events/event-dispatcher';
