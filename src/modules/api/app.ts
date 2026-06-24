/**
 * honoApp - the OpenAPIHono app for the application API
 * (non-Auth.js routes). Mounted at
 * `app/api/[...path]/route.ts` in Slice B-T-025.
 *
 * Wiring only. This file is the §10.5 "Modules isolated"
 * exception for the api module: it imports from the
 * composition root and from each module's barrel, but
 * NOT from any module's internals (infra/application).
 *
 * Composition (in order, top to bottom):
 * - Global `requestIdMiddleware` - every request has a
 *   `requestId` available on the context.
 * - Global `errorHandler` - every thrown error becomes the
 *   `{ error: { code, message, details? } }` envelope.
 * - Global `authMiddleware` - calls the injected
 *   `authjsAuth` function once per request, sets
 *   `c.set('user', session?.user ?? null)`.
 * - Public routes (no `requireSession`): the auth barrel
 *   mounts `/api/health`, `/api/readyz`, and
 *   `/api/auth/register` (with originCheck + rate limit).
 * - Protected sub-app (every route wrapped in
 *   `requireSession`); the sub-app is mounted on the main
 *   app under `/`. Inside the sub-app `c.get('user')` is
 *   narrowed to `AuthUser` (not `AuthUser | null`), so
 *   handlers read the user with no `if (!user)` guard.
 *   The auth barrel mounts `/api/me`. The accounts barrel
 *   mounts the 7 account routes. The transactions
 *   application barrel mounts the 6 transaction routes
 *   (gated on `transactionDeps` being supplied).
 *
 * The dependencies are wired via a factory function
 * `createHonoApp(deps)` so this module does NOT import
 * `next-auth` (which has a known module-resolution bug
 * with `next@15.1.0` - see Slice A apply-progress.md,
 * deviation #4). Production wires the real Auth.js
 * `auth` via `app/api/[...path]/route.ts` (T-025). Tests
 * inject fakes.
 *
 * The app instance is exposed as a function
 * `createHonoApp(deps)` so multiple test suites can build
 * fresh app instances without sharing state; the default
 * `honoApp` export is built from the default factory for
 * production use.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { requestIdMiddleware } from '@/shared/http/request-id';
import { errorHandler } from '@/shared/http/error-handler';
import { requireSession } from './middlewares/require-session';
import type { MiddlewareHandler } from 'hono';
import { mountAuthRoutes } from '@/modules/auth';
import { mountAccountsRoutes } from '@/modules/accounts';
import { mountTransactionsRoutes } from '@/modules/transactions/application';
import { env } from '@/shared/env/env.schema';
import type { AuthUser } from './middlewares/variables';
import { buildAppDeps, type HonoAppDeps } from '@/composition/build-app-deps';

/** Re-export the deps-bag type from the composition root. */
export type { HonoAppDeps } from '@/composition/build-app-deps';

/** Variables stored on the Hono context by the auth middleware. */
export interface HonoContextVariables {
  user: AuthUser | null;
  requestId: string;
}

/**
 * Test seam: build a fresh app with custom deps. The
 * function builds the public app and the protected
 * sub-app and then delegates route registration to the
 * per-module `mountXxxRoutes` functions exposed on each
 * module's barrel.
 *
 * `accountService` is REQUIRED in the deps bag (F-05: the
 * production composition root builds it from
 * `fxRateProvider`; tests that want to mock the service
 * surface inject a fake). The previous
 * "build-from-fxRateProvider" fallback was removed
 * because it forced this file to import
 * `AccountRepositoryPrisma` from
 * `@/modules/accounts/infrastructure/...` - a §10.5
 * violation. The composition root now owns that wiring.
 */
export function createHonoApp(deps: HonoAppDeps): OpenAPIHono<{ Variables: HonoContextVariables }> {
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
  // `app.use('/api/*', authMiddleware)` call below so they
  // bypass the Auth.js session lookup. The
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

  // Register the session gate BEFORE the protected routes
  // so Hono applies it to every subsequent route on this
  // sub-app. The `requireSession` middleware is the
  // cross-cutting session gate for all protected routes.
  protectedApp.use('*', requireSession);

  // Mount all auth-domain routes (public on `app`,
  // protected on `protectedApp`) via a single call. The
  // auth barrel registers originCheck + rate limit on
  // the register route internally; the api module just
  // hosts the app instances.
  mountAuthRoutes(app, protectedApp, { authService: deps.authService });

  // F-03: register `authMiddleware` for `/api/*` AFTER
  // the public routes above.
  app.use('/api/*', authMiddleware);

  // Mount the 7 account-domain routes. `accountService`
  // is required in the deps bag (the composition root
  // builds it from `fxRateProvider`; tests inject fakes).
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
  // was registered before the routes above so it applies
  // to every protected route.
  app.route('/', protectedApp);

  return app;
}

export const honoApp: OpenAPIHono<{ Variables: HonoContextVariables }> =
  createHonoApp(buildAppDeps());

export type AppType = typeof honoApp;
