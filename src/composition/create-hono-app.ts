/**
 * Composition seam: `createHonoApp(deps)`.
 *
 * Builds the OpenAPIHono app instance for the application
 * API (the non-Auth.js routes mounted at
 * `app/api/[...path]/route.ts`). Lives at the composition
 * layer (sibling to `build-app-deps.ts`) because it
 * composes the per-module `mountXxxRoutes` calls — the
 * ONE place where cross-module wiring is allowed (root
 * AGENTS.md §10.5 "Modules isolated").
 *
 * Why split from `src/modules/api/app.ts`?
 *
 *   - `app.ts` was the seam between the api module and
 *     the composition root. Keeping the function there
 *     meant the api module still imported the auth,
 *     accounts, fx, and transactions barrels — fine,
 *     but the build logic (the `createHonoApp` body)
 *     was the composition concern, not the api
 *     concern.
 *   - Moving the function here keeps `app.ts` thin: a
 *     production default (`honoApp`) + the `AppType`
 *     type for client inference + thin re-exports for
 *     downstream consumers (the route handler and the
 *     test suites).
 *   - Tests that build a fresh app with custom deps
 *     now import `createHonoApp` from
 *     `@/composition/create-hono-app` instead of
 *     `@/modules/api/app`. That is correct: the test
 *     IS composing an app instance.
 *
 * Wiring (top to bottom):
 *
 *   1. Global `requestIdMiddleware` — every request has
 *      a `requestId` on the context.
 *   2. Global `errorHandler` — every thrown error
 *      becomes the
 *      `{ error: { code, message, details? } }` envelope.
 *   3. Public routes (no `requireSession`): the auth
 *      barrel mounts `/api/health`, `/api/readyz`, and
 *      `/api/auth/register` (with originCheck + rate
 *      limit).
 *   4. `authMiddleware` for `/api/*` — calls the injected
 *      `authjsAuth` function once per request, sets
 *      `c.set('user', session?.user ?? null)`.
 *   5. Protected sub-app (every route wrapped in
 *      `requireSession`); the sub-app is mounted on the
 *      main app under `/`. Inside the sub-app
 *      `c.get('user')` is narrowed to `AuthUser` (not
 *      `AuthUser | null`), so handlers read the user
 *      with no `if (!user)` guard. The auth barrel
 *      mounts `/api/me`. The accounts barrel mounts the
 *      7 account routes. The transactions application
 *      barrel mounts the 6 transaction routes (gated on
 *      `transactionDeps` being supplied).
 *
 * `accountService` is REQUIRED in the deps bag (F-05:
 * the composition root builds it from `fxRateProvider`;
 * tests that want to mock the service surface inject a
 * fake). The previous "build-from-fxRateProvider"
 * fallback was removed because it forced this file to
 * import `AccountRepositoryPrisma` from
 * `@/modules/accounts/infrastructure/...` — a §10.5
 * violation. The composition root owns that wiring.
 *
 * The factory does NOT import `next-auth` (which has a
 * known module-resolution bug with `next@15.1.0` — see
 * Slice A apply-progress.md, deviation #4). Production
 * wires the real Auth.js `auth` via
 * `app/api/[...path]/route.ts`. Tests inject fakes.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { requestIdMiddleware } from '@/shared/http/request-id';
import { errorHandler } from '@/shared/http/error-handler';
import { requireSession } from '@/modules/api/middlewares/require-session';
import type { MiddlewareHandler } from 'hono';
import { mountAuthRoutes } from '@/modules/auth';
import { mountAccountsRoutes } from '@/modules/accounts';
import { mountTransactionsRoutes } from '@/modules/transactions/application';
import { env } from '@/shared/env/env.schema';
import type { AuthUser } from '@/modules/api/middlewares/variables';
import type { HonoAppDeps } from '@/composition/build-app-deps';

/** Re-export the deps-bag type from the composition root. */
export type { HonoAppDeps } from '@/composition/build-app-deps';

/** Variables stored on the Hono context by the auth middleware. */
export interface HonoContextVariables {
  user: AuthUser | null;
  requestId: string;
}

/**
 * Build a fresh Hono app instance with the given deps.
 * Multiple test suites can call this independently to
 * get isolated app instances; the production entry
 * point calls it once with the default deps.
 */
export function createHonoApp(
  deps: HonoAppDeps,
): OpenAPIHono<{ Variables: HonoContextVariables }> {
  const app = new OpenAPIHono<{ Variables: HonoContextVariables }>();

  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);

  const authMiddleware: MiddlewareHandler = async (c, next) => {
    const session = await deps.authjsAuth();
    const user = session?.user ?? null;
    c.set('user', user);
    await next();
  };

  // F-03: these routes are registered BEFORE the
  // `app.use('/api/*', authMiddleware)` call below so
  // they bypass the Auth.js session lookup. The
  // orchestrator's liveness probe MUST NOT touch the
  // Session table (a DB-down incident would otherwise
  // cascade into a process restart). The public
  // registration endpoint is here for the same reason.

  // ---- Protected sub-app ----
  // Built first so we can pass it to mountAuthRoutes for
  // the protected /api/me registration.
  const protectedApp = new OpenAPIHono<{
    Variables: { user: AuthUser; requestId: string };
  }>();

  // Register the session gate BEFORE the protected
  // routes so Hono applies it to every subsequent route
  // on this sub-app. The `requireSession` middleware is
  // the cross-cutting session gate for all protected
  // routes.
  protectedApp.use('*', requireSession);

  // Mount all auth-domain routes (public on `app`,
  // protected on `protectedApp`) via a single call. The
  // auth barrel registers originCheck + rate limit on
  // the register route internally; the composition seam
  // just hosts the app instances.
  mountAuthRoutes(app, protectedApp, { authService: deps.authService });

  // F-03: register `authMiddleware` for `/api/*` AFTER
  // the public routes above.
  app.use('/api/*', authMiddleware);

  // Mount the 7 account-domain routes. `accountService`
  // is required in the deps bag (the composition root
  // builds it from `fxRateProvider`; tests inject
  // fakes).
  if (!deps.accountService) {
    throw new Error(
      'createHonoApp: deps.accountService is required. ' +
        'The composition root (buildAppDeps) builds it from fxRateProvider.',
    );
  }
  mountAccountsRoutes(protectedApp, {
    accountService: deps.accountService,
    defaultCasa: env.FX_DEFAULT_CASA,
  });

  // Mount the 6 transaction-domain routes (gated on
  // transactionDeps being supplied).
  mountTransactionsRoutes(protectedApp, { transactionDeps: deps.transactionDeps });

  // Mount the protected sub-app under the same path
  // prefix as before. The `requireSession` middleware
  // was registered before the routes above so it
  // applies to every protected route.
  app.route('/', protectedApp);

  return app;
}