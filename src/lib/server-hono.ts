/**
 * In-process Hono request helper for Server Components.
 *
 * Why this exists (design §6.2 of `accounts-ledger`):
 * - The PR-C Server Components need to call the Hono API
 *   from a Server Component, but going through `fetch` to
 *   a real HTTP endpoint would require the
 *   `NEXT_PUBLIC_API_URL` env var to be set, would loop
 *   through the network stack, and would be vulnerable to
 *   SSRF.
 * - The clean alternative is to call `honoApp.fetch(request)`
 *   in-process: no env var, no network, no SSRF surface,
 *   same type safety as the typed client.
 * - The challenge is that the Hono app's `authjsAuth` dep
 *   needs to resolve the session in the context of the
 *   current Server Component request, not a fresh one. So
 *   this helper reads the session via Next's `auth()` and
 *   builds a one-shot Hono app with the session injected
 *   as the `authjsAuth` dep.
 *
 * Usage from a Server Component:
 *   ```ts
 *   const res = await serverHonoRequest('/api/accounts?limit=50&archivedAt=null');
 *   if (!res.ok) throw new Error('list failed: ' + res.status);
 *   const body = await res.json();
 *   ```
 *
 * The `authjsAuth` dep is the same shape as the production
 * catch-all in `app/api/[...path]/route.ts`. The accounts
 * deps (`accountService`, `fxRateProvider`) are wired the
 * same way `buildDefaultDeps()` does in
 * `src/modules/api/app.ts`.
 */

import { auth } from '@/modules/auth';
import { createHonoApp, type HonoAppDeps } from '@/modules/api';
import type { HonoContextVariables } from '@/modules/api/app';
import { UserRepository } from '@/modules/auth/infrastructure/repositories/user.repository';
import { Argon2idHasher } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { prisma } from '@/shared/db/prisma';
import { AccountService } from '@/modules/accounts';
import { AccountRepositoryPrisma } from '@/modules/accounts/infrastructure/repositories/account.repository.prisma';
import { FxRateProviderUnconfigured } from '@/modules/accounts/infrastructure/external/fx-rate-provider.unconfigured';
import { OpenAPIHono } from '@hono/zod-openapi';

function buildAccountsDeps(): Omit<HonoAppDeps, 'authjsAuth'> {
  // The PrismaClient satisfies the narrow port structurally
  // (the `user` and `financialAccount` delegates have the
  // methods the repositories use). The cast keeps this
  // helper from importing the full PrismaClientOptions type
  // for what is, in practice, a structural compat check.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaAny = prisma() as any;
  const userRepo = new UserRepository(prismaAny);
  const hasher = new Argon2idHasher();
  const authService = new AuthService(userRepo, hasher, dispatcher);
  const accountRepo = new AccountRepositoryPrisma({
    financialAccount: prismaAny.financialAccount,
  });
  const fxProvider = new FxRateProviderUnconfigured();
  const accountService = new AccountService(accountRepo, fxProvider);
  return { authService, accountService, fxRateProvider: fxProvider };
}

/**
 * Run a Server-Component-originated request through the
 * Hono app in-process, with the production `auth()` injected
 * as the session source.
 *
 * The path is the same path the catch-all would match
 * (e.g. `/api/accounts?limit=50`). The protocol + host are
 * placeholders; Hono only uses the path + headers + body.
 */
export async function serverHonoRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const session = await auth();
  // Auth.js v5 returns `Session | null` where `session.user`
  // is `{ id, email, ... }` (broader than the AuthjsAuthFn
  // type's narrow shape). We narrow via the optional fields
  // (the production `auth()` call always has them populated
  // for an authenticated user).
  const narrowed =
    session?.user?.id && session.user.email
      ? {
          user: {
            id: String(session.user.id),
            email: String(session.user.email),
          },
        }
      : null;
  const deps: HonoAppDeps = {
    ...buildAccountsDeps(),
    authjsAuth: async () => narrowed,
  };
  const app: OpenAPIHono<{ Variables: HonoContextVariables }> = createHonoApp(deps);
  // Hono accepts a fetch-style Request. We build one with a
  // placeholder origin; Hono only uses the path + method +
  // headers + body, not the host. This keeps the call purely
  // in-process (no network) so the Server Component does
  // not need NEXT_PUBLIC_API_URL.
  const url = path.startsWith('http') ? path : `http://internal${path}`;
  const request = new Request(url, init);
  return app.fetch(request);
}
