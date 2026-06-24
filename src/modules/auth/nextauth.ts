/**
 * Public surface of the `auth` module - the part that
 * pulls the next-auth chain.
 *
 * This sub-barrel is split out from `./index` so the
 * main barrel can be imported from places that must NOT
 * transitively load next-auth (notably the Hono app
 * under `src/modules/api/app.ts` and the api-module
 * tests). See auth-foundation-slice-c issue #18 for
 * the historical context.
 *
 * Consumers:
 * - `app/api/auth/[...nextauth]/route.ts` - mounts the
 *   Auth.js `handlers` for `/api/auth/*`.
 * - Server Components (e.g. `app/accounts/page.tsx`) -
 *   import `auth` for the session lookup.
 * - The proxy (`proxy.ts`) - imports `auth` for the
 *   session gate.
 *
 * The barrel re-exports `auth, signIn, signOut,
 * handlers` from `./infrastructure/external/authjs` (the
 * next-auth configuration).
 */

export { auth, signIn, signOut, handlers } from './infrastructure/external/authjs';
