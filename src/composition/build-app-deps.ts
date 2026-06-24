/**
 * Composition root - the one place where cross-module
 * wiring is allowed (root AGENTS.md section 10.5
 * "Modules isolated"). Every other file in
 * `src/modules/<x>/...` imports ONLY from its own
 * module's barrel; this file is the seam that ties the
 * modules together for the Hono catch-all at
 * `app/api/[...path]/route.ts`.
 *
 * The split from `src/modules/api/app.ts` (pre-PR):
 *   - `app.ts` was a fat composition root plus route
 *     table plus middleware chain in one file. It
 *     imported infra/application from auth, accounts,
 *     fx, and transactions - a section 10.5 violation.
 *   - The fix is structural: pull the wiring functions
 *     into this file (composition root), expose
 *     `mountXxxRoutes(app, deps)` per module on each
 *     barrel, and reduce `app.ts` to wiring-only.
 *
 * The composition root still imports freely from
 * the deep paths under each module's
 * infrastructure and application layers. That is
 * correct and intentional - composition roots are
 * the ONE place where cross-module wiring is
 * allowed. Future composition roots (e.g. for batch
 * jobs, CLI tools) also live at this layer.
 */

import { AuthService } from '@/modules/auth/domain/services/auth.service';
import { Argon2idHasher } from '@/modules/auth/infrastructure/external/argon2.hasher';
import { dispatcher } from '@/shared/events/event-dispatcher';
import { UserRepository } from '@/modules/auth/infrastructure/repositories/user.repository';
import { prisma } from '@/shared/db/prisma';
import { asPrismaDelegateView } from '@/shared/db/prisma-types';
import { systemClock } from '@/shared/clock/system-clock';
import { AccountService, type FxRateProvider } from '@/modules/accounts';
import { AccountRepositoryPrisma } from '@/modules/accounts/infrastructure/repositories/account.repository.prisma';
import { DolarApiClient, FxRateProviderDolarApi, UpstashFxRateCache, withLock } from '@/modules/fx';
import { TransactionRepositoryPrisma } from '@/modules/transactions/infrastructure/repositories/transaction.repository.prisma';
import type { TransactionActionDeps } from '@/modules/transactions/application';
import { logger } from '@/shared/logger/logger';
import type { AuthUser } from '@/modules/api/middlewares/variables';

/**
 * The session resolver shape. Production callers pass
 * the real Auth.js `auth()`; the default `honoApp` boots
 * with a null-session resolver so dev-mode boots do not
 * crash. Production mounts (the catch-all in
 * `app/api/[...path]/route.ts` and the Server-Component
 * helper in `src/lib/server-hono.ts`) supply the real
 * one.
 */
export type AuthjsAuthFn = () => Promise<{ user: AuthUser | null } | null>;

/**
 * The deps-bag the Hono app factory consumes.
 * Production wires the real Auth.js session resolver;
 * tests inject fakes. The shape is a superset of what
 * every mounted route needs (auth, accounts,
 * transactions).
 *
 * `fxRateProvider` is the seam for swapping the FX
 * implementation (the future fx-cache worker replaces
 * the DolarAPI stub). When `accountService` is not
 * supplied, `createHonoApp` builds the `AccountService`
 * from this provider. Tests that want to mock the
 * service inject `accountService` directly.
 */
export interface HonoAppDeps {
  authService: AuthService;
  authjsAuth: AuthjsAuthFn;
  fxRateProvider: FxRateProvider;
  accountService?: AccountService;
  /**
   * Slice 5: the transactions capability's action-layer
   * deps bag. The factory builds the real one (Prisma
   * adapter plus shared dispatcher plus clock plus logger
   * plus FX provider); tests inject a fake one with an
   * in-memory repository to keep the route integration
   * tests hermetic (no Prisma round-trip).
   */
  transactionDeps?: TransactionActionDeps;
}

/**
 * The action-layer deps bag for the transactions
 * capability. Re-exported here for tests and for the
 * Server-Component helper that does not want to import
 * from the application barrel.
 */
export type { TransactionActionDeps };

/**
 * Build the production `HonoAppDeps`. The
 * Server-Component helper at `src/lib/server-hono.ts`
 * and the default `honoApp` export both call this;
 * tests inject a hand-built deps bag instead.
 *
 * The Prisma client is cast through `unknown` for the
 * same generic-vs-structural reason documented in
 * `app.ts` (the Prisma client's methods are generic,
 * not directly assignable to the narrow port's
 * `(args: object) => Promise<unknown>` shape). The
 * runtime call is identical; the cast is purely a
 * type-system convenience.
 */
export function buildAppDeps(): HonoAppDeps {
  const prismaClientForView = prisma() as unknown as Parameters<typeof asPrismaDelegateView>[0];
  const prismaView = asPrismaDelegateView(prismaClientForView);
  const userRepo = new UserRepository({ user: prismaView.user });
  const hasher = new Argon2idHasher();
  const authService = new AuthService(userRepo, hasher, dispatcher, systemClock);
  const fxProvider: FxRateProvider = new FxRateProviderDolarApi({
    cache: new UpstashFxRateCache(),
    lock: withLock,
    dolarApi: new DolarApiClient(),
  });
  // F-05: the production composition root builds the
  // AccountService from the injected FX provider. Tests
  // that want to mock the service surface inject
  // `accountService` directly into the deps bag; the
  // api module no longer builds the service inline (that
  // wiring was a §10.5 violation - the api module used
  // to import AccountRepositoryPrisma from
  // @/modules/accounts/infrastructure/...).
  const accountService = new AccountService(
    new AccountRepositoryPrisma({
      financialAccount: prismaView.financialAccount,
    }),
    fxProvider,
    systemClock,
  );
  const transactionDeps = buildTransactionDeps(fxProvider);
  return {
    authService,
    authjsAuth: async () => null,
    fxRateProvider: fxProvider,
    accountService,
    transactionDeps,
  };
}

/**
 * Build the `TransactionActionDeps` bag the slice-5
 * Hono routes consume.
 *
 * Composition (slice 5 binding):
 * - `repo`: `TransactionRepositoryPrisma` wired against
 *   `asPrismaDelegateView(prisma()).transaction`.
 * - `accountRepository`: `AccountRepositoryPrisma`
 *   wired against the financialAccount delegate. This
 *   closes BR-TX-5: the create path's archived
 *   pre-check now resolves against the real accounts
 *   table in production, not a stub. The slice-5 test
 *   suite injects an in-memory mirror.
 * - `fxRateProvider`: reuses the SAME
 *   `FxRateProviderDolarApi` instance the accounts
 *   service consumes when supplied. A second instance
 *   would double the Upstash cache reads and miss the
 *   cross-cutting stampede lock.
 * - `clock`, `logger`, `dispatcher`: process-wide
 *   singletons.
 *
 * The factory builds the FX provider with the real
 * DolarAPI wiring when none is supplied (the test
 * seam in `src/composition/build-app-deps.test.ts`
 * calls with no args). The production `buildAppDeps`
 * passes the same instance the `AccountService`
 * consumes.
 */
export function buildTransactionDeps(fxRateProvider?: FxRateProvider): TransactionActionDeps {
  const fx: FxRateProvider =
    fxRateProvider ??
    new FxRateProviderDolarApi({
      cache: new UpstashFxRateCache(),
      lock: withLock,
      dolarApi: new DolarApiClient(),
    });
  const prismaClientForView = prisma() as unknown as Parameters<typeof asPrismaDelegateView>[0];
  const prismaView = asPrismaDelegateView(prismaClientForView);
  return {
    repo: new TransactionRepositoryPrisma({ transaction: prismaView.transaction }),
    accountRepository: new AccountRepositoryPrisma({
      financialAccount: prismaView.financialAccount,
    }),
    clock: () => new Date(),
    logger,
    dispatcher,
    fxRateProvider: fx,
  };
}
