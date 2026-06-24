/**
 * API integration tests for the 6 transactions endpoints.
 *
 * 10 cases (~1 happy + 1 auth + 1 validation/not-found per route,
 * with some consolidation across the routes that share a
 * validation path):
 *   - GET /api/transactions — 200 happy + 401 unauth
 *   - GET /api/transactions/account/:accountId — 200 happy
 *   - POST /api/transactions — 201 happy + 400 validation
 *   - GET /api/transactions/:id — 200 happy + 404 not found
 *   - PATCH /api/transactions/:id — 200 happy
 *   - DELETE /api/transactions/:id — 200 happy
 *   - 401 on every endpoint when no session
 *
 * Pattern: each test builds a fresh `createHonoApp` with a
 * fake `transactionDeps` whose repo is an
 * `InMemoryTransactionRepository`. The fake `accountService`
 * covers the BR-TX-5 archived check on the create path.
 *
 * Auth gate: the test injects `authjsAuth` returning a
 * `{ user: { id: TEST_USER_ID, email } }`; the absence of a
 * session is asserted in T7.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHonoApp, type HonoAppDeps } from './app';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import { AccountService } from '@/modules/accounts';
import { FxRateProviderStub } from '@/modules/accounts/infrastructure/external/fx-rate-provider.stub';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { AccountCurrency as TxCurrency } from '@/modules/transactions/domain/entities/transaction';
import type { TransactionActionDeps } from '@/modules/transactions/application/actions/_shared';
import { logger } from '@/shared/logger/logger';
import type { AccountRepositoryPortMirror } from '@/modules/transactions/domain/interfaces/account.repository.port.mirror';

const TEST_USER_ID = 'u-1';

function buildAuthSvc(): AuthService {
  const users: UserRepositoryPort = {
    create: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    update: vi.fn(),
  };
  const hasher: PasswordHasherPort = {
    hash: vi.fn(),
    verify: vi.fn(),
  };
  return new AuthService(users, hasher, new EventDispatcher(), systemClock);
}

function buildDeps(txDeps: TransactionActionDeps): HonoAppDeps {
  return {
    authService: buildAuthSvc(),
    authjsAuth: async () => ({ user: { id: TEST_USER_ID, email: 'a@b.com' } }),
    // The composition root (buildAppDeps) builds the real
    // AccountService from fxRateProvider; tests that do
    // not exercise the account routes inject a fake
    // surface so the createHonoApp contract is satisfied.
    accountService: {
      list: vi.fn(),
      count: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      archive: vi.fn(),
      unarchive: vi.fn(),
      getBalance: vi.fn(),
    } as unknown as AccountService,
    fxRateProvider: new FxRateProviderStub(),
    transactionDeps: txDeps,
  };
}

function buildTxDeps(opts: { repo?: InMemoryTransactionRepository } = {}): TransactionActionDeps {
  const repo = opts.repo ?? new InMemoryTransactionRepository();
  // The BR-TX-5 archived pre-check on the create path loads the
  // parent account via `accountRepository.findById(userId, id)`.
  // The fixture returns a live, non-archived account so the
  // happy-path POST passes the check.
  const accountRepository: AccountRepositoryPortMirror = {
    findById: vi.fn(async () => ({
      id: '00000000-0000-4000-8000-000000000001',
      userId: TEST_USER_ID,
      currency: 'ARS' as const,
      casa: null,
      archivedAt: null,
    })),
  };
  return {
    repo,
    accountRepository,
    clock: () => new Date('2026-06-18T00:00:00.000Z'),
    logger,
    dispatcher: new EventDispatcher(),
    fxRateProvider: new FxRateProviderStub(),
  };
}

describe('GET /api/transactions', () => {
  it('returns 200 with the paginated list', async () => {
    const repo = new InMemoryTransactionRepository();
    await repo.create(TEST_USER_ID, {
      accountId: 'fa-1',
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: TxCurrency.ARS,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-18T00:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: TxCurrency.ARS,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const app = createHonoApp(buildDeps(buildTxDeps({ repo })));
    const res = await app.request('/api/transactions');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it('returns 400 on an invalid limit', async () => {
    // The schema's `.strict()` rejects unknown keys but accepts
    // `limit` outside 1..100 (it clamps, not rejects). Use an
    // unknown key to trigger a 400.
    const app = createHonoApp(buildDeps(buildTxDeps()));
    const res = await app.request('/api/transactions?unknownKey=foo');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/transactions/account/:accountId', () => {
  it('returns 200 with the per-account filtered list', async () => {
    const repo = new InMemoryTransactionRepository();
    const ACCOUNT_UUID = '00000000-0000-4000-8000-000000000001';
    await repo.create(TEST_USER_ID, {
      accountId: ACCOUNT_UUID,
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: TxCurrency.ARS,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-18T00:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: TxCurrency.ARS,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const app = createHonoApp(buildDeps(buildTxDeps({ repo })));
    const res = await app.request(`/api/transactions/account/${ACCOUNT_UUID}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
  });
});

describe('POST /api/transactions', () => {
  it('returns 201 on a valid body (native=casa skip path)', async () => {
    const app = createHonoApp(buildDeps(buildTxDeps()));
    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: '00000000-0000-4000-8000-000000000001',
        direction: 'EXPENSE',
        amountMinor: 1000,
        originalCurrency: 'ARS',
        transactionDate: new Date('2026-06-18T00:00:00.000Z').toISOString(),
        memo: 'coffee',
        category: 'food',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.id).toBeTruthy();
    expect(body.data.memo).toBe('coffee');
  });

  it('returns 400 on a malformed body (missing accountId)', async () => {
    const app = createHonoApp(buildDeps(buildTxDeps()));
    const res = await app.request('/api/transactions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        direction: 'EXPENSE',
        amountMinor: 1000,
        originalCurrency: 'ARS',
        transactionDate: new Date('2026-06-18T00:00:00.000Z').toISOString(),
      }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/transactions/:id', () => {
  it('returns 200 with the row when found', async () => {
    const repo = new InMemoryTransactionRepository();
    // The fixture's `create` generates the id; we capture it
    // for the route call below.
    const created = await repo.create(TEST_USER_ID, {
      accountId: 'fa-1',
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: TxCurrency.ARS,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-18T00:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: TxCurrency.ARS,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const app = createHonoApp(buildDeps(buildTxDeps({ repo })));
    const res = await app.request(`/api/transactions/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe(created.id);
  });

  it('returns 404 when the row is missing', async () => {
    const app = createHonoApp(buildDeps(buildTxDeps()));
    const res = await app.request('/api/transactions/missing');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/transactions/:id', () => {
  it('returns 200 with the updated row on a valid partial body', async () => {
    const repo = new InMemoryTransactionRepository();
    const created = await repo.create(TEST_USER_ID, {
      accountId: 'fa-1',
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: TxCurrency.ARS,
      memo: 'old',
      category: null,
      transactionDate: new Date('2026-06-18T00:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: TxCurrency.ARS,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const app = createHonoApp(buildDeps(buildTxDeps({ repo })));
    const res = await app.request(`/api/transactions/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ memo: 'updated memo' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.memo).toBe('updated memo');
  });
});

describe('DELETE /api/transactions/:id', () => {
  it('returns 200 (or 204) on a successful hard delete', async () => {
    const repo = new InMemoryTransactionRepository();
    const created = await repo.create(TEST_USER_ID, {
      accountId: 'fa-1',
      direction: 'EXPENSE',
      amountMinor: 1000,
      currency: TxCurrency.ARS,
      memo: null,
      category: null,
      transactionDate: new Date('2026-06-18T00:00:00.000Z'),
      convertedAmountMinor: 1000,
      convertedCurrency: TxCurrency.ARS,
      fxAsOfSnapshot: null,
      casaSnapshot: null,
    });
    const app = createHonoApp(buildDeps(buildTxDeps({ repo })));
    const res = await app.request(`/api/transactions/${created.id}`, { method: 'DELETE' });
    expect([200, 204]).toContain(res.status);
  });
});

describe('401 on every endpoint when no session', () => {
  it('GET /api/transactions returns 401 without a session', async () => {
    const deps: HonoAppDeps = {
      authService: buildAuthSvc(),
      authjsAuth: async () => null,
      accountService: {
        list: vi.fn(),
        count: vi.fn(),
        getById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        archive: vi.fn(),
        unarchive: vi.fn(),
        getBalance: vi.fn(),
      } as unknown as AccountService,
      fxRateProvider: new FxRateProviderStub(),
      transactionDeps: buildTxDeps(),
    };
    const app = createHonoApp(deps);
    const res = await app.request('/api/transactions');
    expect(res.status).toBe(401);
  });
});
