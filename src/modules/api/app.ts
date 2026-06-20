/**
 * honoApp — the OpenAPIHono app for the application API
 * (non-Auth.js routes). Mounted at
 * `app/api/[...path]/route.ts` in Slice B-T-025.
 *
 * Composition (in order, top to bottom):
 * - Global `requestIdMiddleware` (Slice A) — every request
 *   has a `requestId` available on the context.
 * - Global `errorHandler` (Slice A) — every thrown error
 *   becomes the `{ error: { code, message, details? } }`
 *   envelope.
 * - Global `authMiddleware` — calls the injected `authjsAuth`
 *   function once per request, sets
 *   `c.set('user', session?.user ?? null)`.
 * - Public routes (no `requireSession`):
 *   - `GET /health` — calls `healthAction`.
 *   - `GET /api/readyz` — DB probe with 1-second timeout.
 *   - `POST /auth/register` — runs through `originCheck`,
 *     `assertWithinRateLimit`, calls `registerAction`.
 * - Protected sub-app (every route wrapped in
 *   `requireSession`); the sub-app is mounted on the main
 *   app under `/`. Inside the sub-app `c.get('user')` is
 *   narrowed to `AuthUser` (not `AuthUser | null`), so
 *   handlers read the user with no `if (!user)` guard.
 *   - `GET /me` (kept for backward compat).
 *   - 7 accounts routes (PR-B, T-B9): `/api/accounts` +
 *     `/api/accounts/:id` + archive / unarchive / balance.
 *
 * The dependencies are wired via a factory function
 * `createHonoApp(deps)` so this module does NOT import
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
import { readyzAction } from '@/modules/auth/application/actions/readyz.action';
import { originCheck } from './middlewares/origin-check';
import { requireSession } from './middlewares/require-session';
import type { MiddlewareHandler } from 'hono';
import { AccountService, FxRateProvider } from '@/modules/accounts';
import { FxRateProviderUnconfigured } from '@/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured';
import { AccountRepositoryPrisma } from '@/modules/accounts/infrastructure/repositories/account.repository.prisma';
import { asPrismaDelegateView } from '@/shared/db/prisma-types';
import { listAccountsAction } from '@/modules/accounts/application/actions/list-accounts.action';
import { getAccountAction } from '@/modules/accounts/application/actions/get-account.action';
import { createAccountAction } from '@/modules/accounts/application/actions/create-account.action';
import { updateAccountAction } from '@/modules/accounts/application/actions/update-account.action';
import { archiveAccountAction } from '@/modules/accounts/application/actions/archive-account.action';
import { unarchiveAccountAction } from '@/modules/accounts/application/actions/unarchive-account.action';
import { getAccountBalanceAction } from '@/modules/accounts/application/actions/get-account-balance.action';
import { toFinancialAccountDto } from '@/modules/accounts/application/dto/financial-account.dto';
import { toBalanceDto } from '@/modules/accounts/application/dto/financial-account-balance.dto';
import { assertWithinRateLimit, rateLimitIdentifier } from '@/shared/rate-limit/rate-limit';
import { systemClock } from '@/shared/clock/system-clock';
import type { AuthUser } from './middlewares/variables';

export type AuthjsAuthFn = () => Promise<{ user: AuthUser | null } | null>;

export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  // F-05: `fxRateProvider` is the seam for swapping the FX
  // implementation (the future `fx-cache` worker replaces
  // the unconfigured stub). When `accountService` is not
  // supplied (the production path), `createHonoApp` builds
  // the `AccountService` from this provider. Tests that
  // want to mock the service inject `accountService`
  // directly; both fields are optional so the surface
  // matches the production intent.
  fxRateProvider: FxRateProvider;
  accountService?: AccountService;
}

/** Variables stored on the Hono context by the auth middleware. */
export interface HonoContextVariables {
  user: AuthUser | null;
  requestId: string;
}

/** Test seam: build a fresh app with custom deps. */
export function createHonoApp(deps: HonoAppDeps): OpenAPIHono<{ Variables: HonoContextVariables }> {
  // F-05: the `fxRateProvider` seam is real. Production
  // callers do NOT supply `accountService`; the service is
  // built here from the injected provider so swapping in a
  // different implementation (e.g. the future `fx-cache`
  // worker) does NOT require editing this file. Tests
  // inject `accountService` directly to mock the service
  // surface; both paths reach the same routes.
  const accountService =
    deps.accountService ??
    new AccountService(
      new AccountRepositoryPrisma({
        financialAccount: asPrismaDelegateView(prisma()).financialAccount,
      }),
      deps.fxRateProvider,
      systemClock,
    );

  const app = new OpenAPIHono<{ Variables: HonoContextVariables }>();

  app.use('*', requestIdMiddleware);
  app.onError(errorHandler);

  const authMiddleware: MiddlewareHandler = async (c, next) => {
    const session = await deps.authjsAuth();
    const user = session?.user ?? null;
    c.set('user', user);
    await next();
  };

  // ---- Public routes (no requireSession, no authMiddleware) ----
  // F-03: these routes are registered BEFORE the
  // `app.use('/api/*', authMiddleware)` call below so they
  // bypass the Auth.js session lookup. The orchestrator's
  // liveness probe MUST NOT touch the Session table (a
  // DB-down incident would otherwise cascade into a
  // process restart). The public registration endpoint
  // is here for the same reason — public sign-up must
  // work without an existing session.
  // Mounted at the `/api` prefix to match the DTOs (see
  // `src/modules/auth/application/dto/health.dto.ts`,
  // `me.dto.ts`, `register.dto.ts`) and ADR-0004 §3.

  app.get('/api/health', async (c) => {
    const res = await healthAction();
    return c.json({ data: res.data }, res.status as 200);
  });

  app.get('/api/readyz', async (c) => {
    const res = await readyzAction();
    return c.json(
      res.status === 200 ? { data: res.data } : { error: res.error },
      res.status as 200 | 503,
    );
  });

  app.use('/api/auth/register', originCheck());
  app.post('/api/auth/register', async (c) => {
    const identifier = rateLimitIdentifier('register', c.req.raw.headers);
    await assertWithinRateLimit(identifier);
    const body = await c.req.json().catch(() => null);
    const res = await registerAction(deps.authService, body);
    if (res.status === 201) {
      return c.json({ data: res.data }, 201);
    }
    return c.json({ error: res.error }, res.status as 400 | 409 | 500);
  });

  // F-03: register `authMiddleware` for `/api/*` AFTER
  // the public routes above. Hono middleware applies only
  // to routes registered after the `use` call, so the
  // liveness probe (`/api/health`), the readiness probe
  // (`/api/readyz`), and the public registration endpoint
  // (`/api/auth/register`) keep working without a session
  // lookup. The protected sub-app (mounted below) and any
  // future `/api/*` route will see `c.get('user')` set.
  app.use('/api/*', authMiddleware);

  // ---- Protected sub-app ----
  // Routes on this sub-app see `c.get('user')` as
  // `AuthUser` (not `AuthUser | null`) thanks to the
  // `requireSession` middleware's narrowed Variables
  // type. The 7 dead `if (!user)` guards are gone.

  const protectedApp = new OpenAPIHono<{
    Variables: { user: AuthUser; requestId: string };
  }>();

  // Register the session gate BEFORE the protected routes so
  // Hono applies it to every subsequent route on this sub-app.
  // Routes on this sub-app see `c.get('user')` as `AuthUser`
  // (not `AuthUser | null`) thanks to the `requireSession`
  // middleware's narrowed Variables type. The 7 dead `if (!user)`
  // guards are gone.
  protectedApp.use('*', requireSession);

  protectedApp.get('/api/me', async (c) => {
    const res = await meAction(deps.authService, c);
    if (res.status === 200) {
      return c.json({ data: res.data }, 200);
    }
    return c.json({ error: res.error }, res.status as 401);
  });

  const accountDeps = { accountService };

  // 1. List accounts
  protectedApp.get('/api/accounts', async (c) => {
    const user = c.get('user');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await listAccountsAction(accountDeps, user.id, query);
    if (res.ok) {
      return c.json(
        {
          data: res.data.data.map(toFinancialAccountDto),
          nextCursor: res.data.nextCursor,
          total: res.data.total,
        },
        200,
      );
    }
    return c.json({ error: res.error }, res.status as 400);
  });

  // 2. Create account
  protectedApp.post('/api/accounts', async (c) => {
    const user = c.get('user');
    const body = await c.req.json().catch(() => null);
    const res = await createAccountAction(accountDeps, user.id, body);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 201);
    }
    return c.json({ error: res.error }, res.status as 400 | 409);
  });

  // 3. Get one account
  protectedApp.get('/api/accounts/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const res = await getAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 4. Partial update
  protectedApp.patch('/api/accounts/:id', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const res = await updateAccountAction(accountDeps, user.id, id, body);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 400 | 404);
  });

  // 5. Archive
  protectedApp.post('/api/accounts/:id/archive', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const res = await archiveAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 6. Unarchive
  protectedApp.post('/api/accounts/:id/unarchive', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const res = await unarchiveAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 7. Display-only FX conversion
  protectedApp.get('/api/accounts/:id/balance', async (c) => {
    const user = c.get('user');
    const id = c.req.param('id');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getAccountBalanceAction(accountDeps, user.id, id, query);
    if (res.ok) {
      return c.json({ data: toBalanceDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 400 | 404 | 409 | 503);
  });

  // Mount the protected sub-app under the same path prefix
  // as before. The `requireSession` middleware was registered
  // before the routes above so it applies to every protected
  // route.
  app.route('/', protectedApp);

  return app;
}

function buildDefaultDeps(): HonoAppDeps {
  // The PrismaClient satisfies the narrow port structurally
  // (it has a `user` delegate with the four methods the
  // repository uses). The narrow `asPrismaDelegateView`
  // helper (see `src/shared/db/prisma-types.ts`, F-14)
  // keeps `app.ts` from importing the full
  // PrismaClientOptions type for what is, in practice, a
  // structural compat check, and avoids `as any`.
  const prismaView = asPrismaDelegateView(prisma());
  const userRepo = new UserRepository({ user: prismaView.user });
  const hasher = new Argon2idHasher();
  const authService = new AuthService(userRepo, hasher, dispatcher, systemClock);
  // F-05: only the FX provider is wired at the deps level;
  // the AccountService is built inside `createHonoApp`.
  // The fx-cache change will swap this for a real provider
  // without touching the rest of the file.
  const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();
  return {
    authService,
    // The real `auth()` is loaded by the production route
    // file (app/api/[...path]/route.ts) and passed in via
    // `createHonoApp`. The default `honoApp` below uses a
    // `null` session resolver so dev-mode boots do not
    // crash; production mounts MUST pass the real `auth`.
    authjsAuth: async () => null,
    fxRateProvider: fxProvider,
  };
}

export const honoApp: OpenAPIHono<{ Variables: HonoContextVariables }> =
  createHonoApp(buildDefaultDeps());

export type AppType = typeof honoApp;
