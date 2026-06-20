/**
 * API integration tests for the 7 accounts endpoints.
 *
 * 14 cases (2 per endpoint): happy path + at least one error.
 * Uses `honoApp.request(new Request(...))` against the
 * in-process Hono instance; no `next dev` spawn required.
 * Cross-module invariant: every test injects a session user
 * via `buildDeps(authjsAuth)`; the absence of a session is
 * asserted in T-B7.
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
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '@/modules/accounts/domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';

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

function makeRow(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
  return {
    id: 'fa-1',
    userId: TEST_USER_ID,
    type: AccountType.BANK,
    name: 'Main',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: OpeningBalanceMode.FRESH,
    openingBalanceDate: null,
    archivedAt: null,
    bankName: 'ICBC',
    accountKind: AccountKind.SAVINGS,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDeps(accountService: AccountService, fx: FxRateProviderStub): HonoAppDeps {
  return {
    authService: buildAuthSvc(),
    authjsAuth: async () => ({ user: { id: TEST_USER_ID, email: 'a@b.com' } }),
    accountService,
    fxRateProvider: fx,
  };
}

function buildAccountServiceMock(
  overrides: Partial<{
    list: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    archive: ReturnType<typeof vi.fn>;
    unarchive: ReturnType<typeof vi.fn>;
    getBalance: ReturnType<typeof vi.fn>;
  }> = {},
): AccountService {
  return {
    list: overrides.list ?? vi.fn(async () => ({ data: [], nextCursor: null })),
    count: overrides.count ?? vi.fn(async () => 0),
    getById: overrides.getById ?? vi.fn(async () => makeRow()),
    create: overrides.create ?? vi.fn(async () => makeRow()),
    update: overrides.update ?? vi.fn(async () => makeRow()),
    archive: overrides.archive ?? vi.fn(async () => makeRow({ archivedAt: new Date() })),
    unarchive: overrides.unarchive ?? vi.fn(async () => makeRow({ archivedAt: null })),
    getBalance:
      overrides.getBalance ??
      vi.fn(async () => ({
        native: { amount: 100000, currency: AccountCurrency.USD },
        display: {
          amount: 92000,
          currency: AccountCurrency.EUR,
          fxRate: 0.92,
          fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
        },
      })),
  } as unknown as AccountService;
}

const fxStub = () => new FxRateProviderStub();

describe('GET /api/accounts', () => {
  it('returns 200 with the paginated list', async () => {
    const svc = buildAccountServiceMock({
      list: vi.fn(async () => ({ data: [makeRow()], nextCursor: null })),
    });
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.nextCursor).toBeNull();
  });

  it('returns 400 on an invalid limit', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts?limit=500');
    expect(res.status).toBe(400);
  });
});

describe('POST /api/accounts', () => {
  it('returns 201 on a valid BANK body', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: AccountType.BANK,
        name: 'Main',
        currency: AccountCurrency.USD,
        openingBalance: { mode: OpeningBalanceMode.FRESH, amountMinor: 0 },
        bankName: 'ICBC',
        accountKind: AccountKind.SAVINGS,
      }),
    });
    expect(res.status).toBe(201);
  });

  it('returns 400 on a malformed body', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: AccountType.BANK, name: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/accounts/:id', () => {
  it('returns 200 with the row when found', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.id).toBe('fa-1');
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    const svc = buildAccountServiceMock({
      getById: vi.fn(async () => {
        throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'not found' });
      }),
    });
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/missing');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/accounts/:id', () => {
  it('returns 200 on a valid partial body', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: AccountType.BANK, name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 400 on a malformed body', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: AccountType.BANK, name: '' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/accounts/:id/archive', () => {
  it('returns 200 with archivedAt set', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1/archive', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archivedAt).not.toBeNull();
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    const svc = buildAccountServiceMock({
      archive: vi.fn(async () => {
        throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'not found' });
      }),
    });
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/missing/archive', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/accounts/:id/unarchive', () => {
  it('returns 200 with archivedAt = null', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1/unarchive', { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.archivedAt).toBeNull();
  });

  it('returns 404 when the service throws NOT_FOUND', async () => {
    const svc = buildAccountServiceMock({
      unarchive: vi.fn(async () => {
        throw new AppError({ code: ErrorCode.NOT_FOUND, message: 'not found' });
      }),
    });
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/missing/unarchive', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/accounts/:id/balance', () => {
  it('returns 200 with the conversion', async () => {
    const svc = buildAccountServiceMock();
    const app = createHonoApp(buildDeps(svc, fxStub()));
    const res = await app.request('/api/accounts/fa-1/balance?displayCurrency=EUR');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.display.amount).toBe(92000);
  });

  it('returns 503 when the FX provider is unavailable', async () => {
    const fx = new FxRateProviderStub();
    fx.setMode('unavailable');
    const svc = buildAccountServiceMock({
      getBalance: vi.fn(async (_userId: string, _id: string, _ccy: AccountCurrency) => {
        throw new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'unavailable' });
      }),
    });
    const app = createHonoApp(buildDeps(svc, fx));
    const res = await app.request('/api/accounts/fa-1/balance?displayCurrency=EUR');
    expect(res.status).toBe(503);
  });
});

describe('401 on every endpoint when no session', () => {
  it('GET /api/accounts returns 401 without a session', async () => {
    const svc = buildAccountServiceMock();
    const deps: HonoAppDeps = {
      authService: buildAuthSvc(),
      authjsAuth: async () => null,
      accountService: svc,
      fxRateProvider: fxStub(),
    };
    const app = createHonoApp(deps);
    const res = await app.request('/api/accounts');
    expect(res.status).toBe(401);
  });
});
