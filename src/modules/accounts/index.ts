/**
 * Public surface of the `accounts` module. Other modules
 * (and the `app/` tree) import ONLY from this file. Nothing
 * else in the codebase reaches into the module's internals.
 *
 * Exports:
 * - `AccountService` - the domain orchestrator (constructed
 *   by the Hono `buildAppDeps()` in `src/composition` with
 *   the Prisma repository and the unconfigured FX provider).
 * - The 5 enums (`AccountType`, `AccountKind`,
 *   `InvestmentType`, `OpeningBalanceMode`, `AccountCurrency`)
 *   re-declared as plain TypeScript constants (no Prisma
 *   import - architecture-standards rule).
 * - The two ports (`AccountRepositoryPort`, `FxRateProvider`)
 *   declared in the domain layer; consumers inject concrete
 *   implementations.
 * - The `OpeningBalance` value object and `FinancialAccount`
 *   shape for use in application actions.
 * - `mountAccountsRoutes` - mounts the 7 account-domain
 *   routes on the supplied protected sub-app.
 *
 * The barrel does NOT export the entity `index.ts`
 * (the entities barrel) - consumers import the symbols they
 * need from here directly. The entities barrel exists so the
 * domain layer can re-export the same symbols without a circular
 * import through `src/modules/accounts/index.ts`.
 */

import type { OpenAPIHono } from '@hono/zod-openapi';
import type { AccountService } from './domain/services/account.service';
import { listAccountsAction } from './application/actions/list-accounts.action';
import { getAccountAction } from './application/actions/get-account.action';
import { createAccountAction } from './application/actions/create-account.action';
import { updateAccountAction } from './application/actions/update-account.action';
import { archiveAccountAction } from './application/actions/archive-account.action';
import { unarchiveAccountAction } from './application/actions/unarchive-account.action';
import {
  getAccountBalanceAction,
  type GetAccountBalanceActionDeps,
} from './application/actions/get-account-balance.action';
import { toFinancialAccountDto } from './application/dto/financial-account.dto';
import { toBalanceDto } from './application/dto/financial-account-balance.dto';
import type { AuthUser } from '@/modules/api/middlewares/variables';
import type { FxCasaString } from '@/modules/fx';

export { AccountService } from './domain/services/account.service';

export {
  AccountType,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountCurrency,
} from './domain/entities/financial-account';
export type {
  AccountType as AccountTypeT,
  AccountKind as AccountKindT,
  InvestmentType as InvestmentTypeT,
  OpeningBalanceMode as OpeningBalanceModeT,
  AccountCurrency as AccountCurrencyT,
  FinancialAccount,
} from './domain/entities/financial-account';

export {
  OpeningBalance,
  type FreshOpeningBalance,
  type HistoricalOpeningBalance,
  type OpeningBalance as OpeningBalanceT,
} from './domain/value-objects/opening-balance';

export type {
  AccountRepositoryPort,
  ListAccountsOptions,
  ListAccountsPage,
  CreateFinancialAccountInput,
  UpdateFinancialAccountPatch,
} from './domain/interfaces/account.repository.port';

export type {
  FxRateProvider,
  FxConversionRequest,
  FxConversionResult,
} from './domain/interfaces/fx-rate-provider.port';

/**
 * Variables shape used by the protected sub-app. The
 * `requireSession` middleware (registered by the
 * composition root) narrows `user` to `AuthUser`
 * (non-null).
 */
type AccountsProtectedVariables = { user: AuthUser; requestId: string };

/**
 * The deps the accounts routes need from the composition
 * root. `accountService` is the AccountService built in
 * `src/composition/build-app-deps.ts` (composition root).
 * `defaultCasa` is the resolved FX default (the env
 * `FX_DEFAULT_CASA` value, or undefined when unset), passed
 * through so the balance action stays pure and testable.
 * The action layer applies the implicit fallback
 * ('oficial') when `defaultCasa` is undefined.
 */
export interface MountAccountsRoutesDeps {
  accountService: AccountService;
  defaultCasa?: FxCasaString;
}

/**
 * Mount the 7 account-domain routes on the supplied
 * protected sub-app:
 *   1. `GET /api/accounts` - list with pagination.
 *   2. `POST /api/accounts` - create.
 *   3. `GET /api/accounts/:id` - get one.
 *   4. `PATCH /api/accounts/:id` - partial update.
 *   5. `POST /api/accounts/:id/archive` - archive.
 *   6. `POST /api/accounts/:id/unarchive` - unarchive.
 *   7. `GET /api/accounts/:id/balance` - display-only FX
 *      conversion (REQ-ACCT-7).
 *
 * Every route filters by `user.id` from `c.get('user')`
 * (BR-ACCT-4). The `requireSession` middleware is
 * registered on this sub-app by the composition root
 * before this call, so `c.get('user')` is narrowed to
 * `AuthUser` (non-null) inside the handlers.
 */
export function mountAccountsRoutes(
  protectedApp: OpenAPIHono<{ Variables: AccountsProtectedVariables }>,
  deps: MountAccountsRoutesDeps,
): void {
  const { accountService } = deps;
  const accountDeps = { accountService };
  // PR-3 T3.4: the balance action receives the resolved
  // `defaultCasa` via deps so the function stays pure
  // and testable. The env is read once at startup; the
  // implicit fallback is `'oficial'`.
  const balanceDeps: GetAccountBalanceActionDeps = {
    accountService,
    defaultCasa: deps.defaultCasa,
  };

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
    const res = await getAccountBalanceAction(balanceDeps, user.id, id, query);
    if (res.ok) {
      return c.json({ data: toBalanceDto(res.data) }, 200);
    }
    return c.json({ error: res.error }, res.status as 400 | 404 | 409 | 503);
  });
}

// F-09: infrastructure classes (the Prisma adapter and the
// FX provider implementations) are NOT re-exported from
// this barrel. Ports & Adapters - the domain ports above
// are the contract; the infrastructure adapters are
// implementations wired by the composition root
// (`src/composition/build-app-deps.ts`).
// Consumers that need a specific implementation import it
// from the deep path
// (`@/modules/accounts/infrastructure/...`).
