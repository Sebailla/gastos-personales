/**
 * mountAuthRoutes - the Hono route layer for the auth
 * module's domain routes.
 *
 * IMPORTANT: this file does NOT import from
 * `./infrastructure/external/authjs` (the next-auth
 * configuration). The `next-auth` package has a known
 * module-resolution bug with `next@15.1.0+` (see
 * `src/modules/auth/index.test.ts` issue #18), and
 * `src/modules/api/app.ts` historically imported from
 * the deep paths under `@/modules/auth/domain/...`
 * and `@/modules/auth/application/...` to avoid
 * transitively pulling next-auth. The routes layer
 * preserves that invariant: this file imports ONLY
 * from the auth domain/application layers and the
 * api middleware (`originCheck` - the cross-cutting
 * origin gate).
 *
 * Exposed on the auth barrel as
 * `mountAuthRoutes(publicApp, protectedApp, deps)`.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AuthService } from './domain/services/auth.service';
import { registerAction } from './application/actions/register.action';
import { meAction } from './application/actions/me.action';
import { healthAction } from './application/actions/health.action';
import { readyzAction } from './application/actions/readyz.action';
import { assertWithinRateLimit, rateLimitIdentifier } from '@/shared/rate-limit/rate-limit';
import { originCheck } from '@/shared/http/origin-check';
import type { AuthUser } from '@/modules/api/middlewares/variables';

/**
 * Variables shape used by the auth routes' public mount
 * (the main app). The auth routes do not narrow `user`
 * to `AuthUser` (the public routes see `AuthUser | null`).
 */
type AuthPublicVariables = { user: AuthUser | null; requestId: string };

/**
 * Variables shape used by the protected `/api/me` route.
 * The `requireSession` middleware narrows `user` to
 * `AuthUser` (non-null) on the protected sub-app.
 */
type AuthProtectedVariables = { user: AuthUser; requestId: string };

/**
 * The deps the auth routes need from the composition
 * root. `authService` is the AuthService built in
 * `src/composition/build-app-deps.ts` (composition root).
 */
export interface MountAuthRoutesDeps {
  authService: AuthService;
}

/**
 * Mount the auth-domain routes on the supplied Hono
 * apps. The two apps are optional and independent:
 *
 * - `publicApp` receives the public auth routes
 *   (`/api/health`, `/api/readyz`, `/api/auth/register`).
 *   These routes are registered BEFORE the
 *   `app.use('/api/*', authMiddleware)` call in the
 *   composition root so they bypass the session lookup
 *   (F-03: a DB-down incident must not cascade into a
 *   process restart via the liveness probe).
 *
 * - `protectedApp` receives the `/api/me` route. The
 *   `requireSession` middleware is registered on this
 *   sub-app by the composition root before this call,
 *   so `c.get('user')` is narrowed to `AuthUser`
 *   (non-null) inside the handler.
 *
 * Cross-module rule: this function imports the
 * `originCheck` middleware from
 * `@/modules/api/middlewares/origin-check`. The api
 * module is the platform/wiring layer (not a domain
 * module), and the middleware is cross-cutting to all
 * mutating routes - acceptable per root AGENTS.md
 * §10.5 "Modules isolated" because the middleware is
 * a stable platform concern, not a leak of another
 * domain module's internals.
 */
export function mountAuthRoutes(
  publicApp: OpenAPIHono<{ Variables: AuthPublicVariables }> | undefined,
  protectedApp: OpenAPIHono<{ Variables: AuthProtectedVariables }> | undefined,
  deps: MountAuthRoutesDeps,
): void {
  if (publicApp) {
    // --- Public operational routes (no session) ---

    publicApp.get('/api/health', async (c) => {
      const res = await healthAction();
      return c.json({ data: res.data }, res.status as 200);
    });

    publicApp.get('/api/readyz', async (c) => {
      const res = await readyzAction();
      return c.json(
        res.status === 200 ? { data: res.data } : { error: res.error },
        res.status as 200 | 503,
      );
    });

    // --- Public registration (with origin + rate-limit guards) ---

    publicApp.use('/api/auth/register', originCheck());
    publicApp.post('/api/auth/register', async (c) => {
      const identifier = rateLimitIdentifier('register', c.req.raw.headers);
      await assertWithinRateLimit(identifier);
      const body = await c.req.json().catch(() => null);
      const res = await registerAction(deps.authService, body);
      if (res.status === 201) {
        return c.json({ data: res.data }, 201);
      }
      return c.json({ error: res.error }, res.status as 400 | 409 | 500);
    });
  }

  if (protectedApp) {
    // --- Protected /api/me (session required) ---

    protectedApp.get('/api/me', async (c) => {
      const res = await meAction(deps.authService, c);
      if (res.status === 200) {
        return c.json({ data: res.data }, 200);
      }
      return c.json({ error: res.error }, res.status as 401);
    });
  }
}
