/**
 * Public surface of the `auth` module. Other modules (and
 * the `app/` tree) import ONLY from this file. Nothing else
 * in the codebase reaches into the module's internals.
 *
 * Exports:
 * - `mountAuthRoutes` - mounts the auth-domain routes
 *   (`/api/health`, `/api/readyz`, `/api/auth/register`,
 *   `/api/me`) on the supplied Hono apps.
 * - The `UserRegistered` / `UserSignedIn` event-name
 *   constants for cross-module subscribers.
 *
 * The next-auth chain (`auth`, `signIn`, `signOut`,
 * `handlers`) is exposed via the `./nextauth` sub-barrel,
 * NOT this main barrel. The reason: next-auth has a known
 * module-resolution bug with `next@15.1.0+` (see
 * `src/modules/auth/index.test.ts` issue #18), and the
 * Hono app under `src/modules/api/app.ts` historically
 * avoided the barrel to keep the next-auth chain out of
 * the Hono app's import graph. Consumers that need
 * next-auth (the Auth.js catch-all route, Server
 * Components, the proxy) import directly from
 * `@/modules/auth/nextauth`.
 *
 * The barrel does NOT re-export `honoApp` either. The
 * Hono app instance is consumed by
 * `app/api/[...path]/route.ts` via a direct import from
 * `@/modules/api` (a re-export here would create a
 * circular dependency: `auth -> api -> auth`).
 *
 * The local `./routes` file does NOT import from
 * `./infrastructure/external/authjs`, so `mountAuthRoutes`
 * is safe to expose through the barrel - the next-auth
 * chain stays broken at the right level.
 */

export { UserRegistered, UserSignedIn } from '@/shared/events/event-dispatcher';
export { mountAuthRoutes, type MountAuthRoutesDeps } from './routes';
