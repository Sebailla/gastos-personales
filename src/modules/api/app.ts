/**
 * honoApp — the OpenAPIHono app for the application API
 * (non-Auth.js routes). Mounted at
 * `app/api/[...path]/route.ts` in Slice B-T-025.
 *
 * Composition:
 * - Global `requestIdMiddleware` (Slice A) — every request
 *   has a `requestId` available on the context.
 * - Global `errorHandler` (Slice A) — every thrown error
 *   becomes the `{ error: { code, message, details? } }`
 *   envelope.
 * - Global `authMiddleware` — calls the injected `authjsAuth`
 *   function once per request, sets
 *   `c.set('user', session?.user ?? null)`.
 * - Three routes:
 *   - `GET /health` — public, calls `healthAction`.
 *   - `GET /me` — calls `meAction`; returns 401
 *     `UNAUTHORIZED` if no session.
 *   - `POST /auth/register` — runs through `originCheck`
 *     (mutating routes only), calls `registerAction`.
 *
 * The dependencies (`authService`, `authjsAuth`) are wired
 * via a factory function so this module does NOT import
 * `next-auth` (which has a known module-resolution bug with
 * `next@15.1.0` — see Slice A apply-progress.md, deviation
 * #4). Production wires the real Auth.js `auth` via
 * `app/api/[...path]/route.ts` (T-025). Tests inject fakes.
 *
 * The app instance is exposed as a function
 * `createHonoApp(deps)` so multiple test suites can build
 * fresh app instances without sharing state; the default
 * `honoApp` export is built from the default factory for
 * production use.
 */

import { OpenAPIHono } from '@hono/zod-openapi';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import { Argon2idHasher } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { UserRepository } from '@/modules/auth/infrastructure/repositories/user.repository';
import { prisma } from '@/shared/db/prisma';
import { requestIdMiddleware } from '@/shared/http/request-id';
import { errorHandler } from '@/shared/http/error-handler';
import { registerAction } from '@/modules/auth/application/actions/register.action';
import { meAction } from '@/modules/auth/application/actions/me.action';
import { healthAction } from '@/modules/auth/application/actions/health.action';
import { originCheck } from './middlewares/origin-check';
import type { MiddlewareHandler } from 'hono';

export type AuthjsAuthFn = () => Promise<{ user: { id: string; email: string } | null } | null>;

export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
}

/** Test seam: build a fresh app with custom deps. */
export function createHonoApp(deps: HonoAppDeps): OpenAPIHono {
  const app = new OpenAPIHono();

  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);

  const authMiddleware: MiddlewareHandler = async (c, next) => {
    const session = await deps.authjsAuth();
    const user = session?.user ?? null;
    c.set('user', user);
    await next();
  };

  app.use('*', authMiddleware);

  app.get('/health', async (c) => {
    const res = await healthAction();
    return c.json({ data: res.data }, res.status as 200);
  });

  app.get('/me', async (c) => {
    const res = await meAction(deps.authService, c);
    if (res.status === 200) {
      return c.json({ data: res.data }, 200);
    }
    return c.json({ error: res.error }, res.status as 401);
  });

  app.use('/auth/register', originCheck());
  app.post('/auth/register', async (c) => {
    const body = await c.req.json().catch(() => null);
    const res = await registerAction(deps.authService, body);
    if (res.status === 201) {
      return c.json({ data: res.data }, 201);
    }
    return c.json({ error: res.error }, res.status as 400 | 409 | 500);
  });

  return app;
}

function buildDefaultDeps(): HonoAppDeps {
  // The PrismaClient satisfies the narrow port structurally
  // (it has a `user` delegate with the four methods the
  // repository uses). The cast keeps `app.ts` from
  // importing the full PrismaClientOptions type for what
  // is, in practice, a structural compat check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userRepo = new UserRepository(prisma() as any);
  const hasher = new Argon2idHasher();
  return {
    authService: new AuthService(userRepo, hasher, dispatcher),
    // The real `auth()` is loaded by the production route
    // file (app/api/[...path]/route.ts) and passed in via
    // `createHonoApp`. The default `honoApp` below uses a
    // `null` session resolver so dev-mode boots do not
    // crash; production mounts MUST pass the real `auth`.
    authjsAuth: async () => null,
  };
}

export const honoApp: OpenAPIHono = createHonoApp(buildDefaultDeps());

export type AppType = typeof honoApp;
