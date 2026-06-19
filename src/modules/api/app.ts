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
 *   - `POST /auth/register` — runs through `originCheck`,
 *     calls `registerAction`.
 * - Protected routes (each wrapped in `requireSession`):
 *   - 3 auth routes (kept for backward compat): `/me`.
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
import { originCheck } from './middlewares/origin-check';
import { requireSession } from './middlewares/require-session';
import type { MiddlewareHandler } from 'hono';
import { AccountService } from '@/modules/accounts';
import { FxRateProvider, FxRateProviderUnconfigured } from '@/modules/accounts';
import { AccountRepositoryPrisma } from '@/modules/accounts/infrastructure/repositories/account.repository.prisma';
import { listAccountsAction } from '@/modules/accounts/application/actions/list-accounts.action';
import { getAccountAction } from '@/modules/accounts/application/actions/get-account.action';
import { createAccountAction } from '@/modules/accounts/application/actions/create-account.action';
import { updateAccountAction } from '@/modules/accounts/application/actions/update-account.action';
import { archiveAccountAction } from '@/modules/accounts/application/actions/archive-account.action';
import { unarchiveAccountAction } from '@/modules/accounts/application/actions/unarchive-account.action';
import { getAccountBalanceAction } from '@/modules/accounts/application/actions/get-account-balance.action';
import { toFinancialAccountDto } from '@/modules/accounts/application/dto/financial-account.dto';
import { toBalanceDto } from '@/modules/accounts/application/dto/financial-account-balance.dto';

export type AuthjsAuthFn = () => Promise<{ user: { id: string; email: string } | null } | null>;

export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  // PR-B additions
  accountService: AccountService;
  fxRateProvider: FxRateProvider;
}

/** Variables stored on the Hono context by the auth middleware. */
export interface HonoContextVariables {
  user: { id: string; email: string } | null;
  requestId: string;
}

/** Test seam: build a fresh app with custom deps. */
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

  app.use('*', authMiddleware);

  // ---- Public routes (no requireSession) ----

  app.get('/health', async (c) => {
    const res = await healthAction();
    return c.json({ data: res.data }, res.status as 200);
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

  // ---- Protected auth route (requireSession) ----

  app.get('/me', requireSession, async (c) => {
    const res = await meAction(deps.authService, c);
    if (res.status === 200) {
      return c.json({ data: res.data }, 200);
    }
    return c.json({ error: res.error }, res.status as 401);
  });

  // ---- Protected accounts routes (T-B9) ----

  const accountDeps = { accountService: deps.accountService };

  // 1. List accounts
  app.get('/api/accounts', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await listAccountsAction(accountDeps, user.id, query);
    if (res.ok) {
      return c.json(
        { data: res.data.data.map(toFinancialAccountDto), nextCursor: res.data.nextCursor, total: res.data.total },
        200,
      );
    }
    return c.json({ error: res.error }, res.status as 400);
  });

  // 2. Create account
  app.post('/api/accounts', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const body = await c.req.json().catch(() => null);
    const res = await createAccountAction(accountDeps, user.id, body);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 201);
    }
    return c.json({ error: res.error }, res.status as 400 | 409);
  });

  // 3. Get one account
  app.get('/api/accounts/:id', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const id = c.req.param('id');
    const res = await getAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 4. Partial update
  app.patch('/api/accounts/:id', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const id = c.req.param('id');
    const body = await c.req.json().catch(() => null);
    const res = await updateAccountAction(accountDeps, user.id, id, body);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 400 | 404);
  });

  // 5. Archive
  app.post('/api/accounts/:id/archive', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const id = c.req.param('id');
    const res = await archiveAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 6. Unarchive
  app.post('/api/accounts/:id/unarchive', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const id = c.req.param('id');
    const res = await unarchiveAccountAction(accountDeps, user.id, id);
    if (res.ok) {
      return c.json({ data: toFinancialAccountDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 404);
  });

  // 7. Display-only FX conversion
  app.get('/api/accounts/:id/balance', requireSession, async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Auth required' } }, 401);
    const id = c.req.param('id');
    const query = Object.fromEntries(new URL(c.req.url).searchParams);
    const res = await getAccountBalanceAction(accountDeps, user.id, id, query);
    if (res.ok) {
      return c.json({ data: toBalanceDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 400 | 404 | 409 | 500 | 503);
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
  const authService = new AuthService(userRepo, hasher, dispatcher);
  // The Accounts module deps: Prisma repository + the
  // unconfigured FX stub (the fx-cache change replaces it).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accountRepo = new AccountRepositoryPrisma({ financialAccount: (prisma() as any).financialAccount });
  const fxProvider: FxRateProvider = new FxRateProviderUnconfigured();
  const accountService = new AccountService(accountRepo, fxProvider);
  return {
    authService,
    // The real `auth()` is loaded by the production route
    // file (app/api/[...path]/route.ts) and passed in via
    // `createHonoApp`. The default `honoApp` below uses a
    // `null` session resolver so dev-mode boots do not
    // crash; production mounts MUST pass the real `auth`.
    authjsAuth: async () => null,
    accountService,
    fxRateProvider: fxProvider,
  };
}

export const honoApp: OpenAPIHono<{ Variables: HonoContextVariables }> = createHonoApp(
  buildDefaultDeps(),
);

export type AppType = typeof honoApp;
