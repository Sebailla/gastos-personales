/**
 * Tests for getAccountBalanceAction.
 *
 * PR-3 T3.4 cases (casa resolution):
 * (1) account.casa = null, env.FX_DEFAULT_CASA unset -> service
 *     receives casa = 'oficial' (the port-level default).
 * (2) account.casa = 'BLUE' (UPPERCASE) -> service receives
 *     casa = 'blue' (lowercase DolarAPI form).
 * (3) account.casa = null, env.FX_DEFAULT_CASA = 'mep' -> service
 *     receives casa = 'mep' (env wins).
 *
 * Plus the PR-2 / PR-1 cases:
 * - happy path (200)
 * - FX_UNAVAILABLE (503)
 * - FX_NOT_SUPPORTED (409)
 * - missing displayCurrency (400)
 */

import { describe, it, expect, vi } from "vitest";
import { assertOk, assertFail } from "./_narrow";
import {
  getAccountBalanceAction,
  type GetAccountBalanceActionDeps,
} from './get-account-balance.action';
import { AccountCurrency } from '../../domain/entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { ErrorCode } from '@/shared/errors/error-codes';
import type {
  FxConversionResult,
  FxCasaString,
} from '../../domain/interfaces/fx-rate-provider.port';
import type {
  AccountRepositoryPort,
} from '../../domain/interfaces/account.repository.port';
import type { FinancialAccount } from '../../domain/entities/financial-account';

const successResult: FxConversionResult = {
  native: { amount: 100000, currency: AccountCurrency.USD },
  display: {
    amount: 92000,
    currency: AccountCurrency.EUR,
    fxRate: 0.92,
    fxAsOf: new Date('2026-06-18T20:00:00.000Z'),
  },
  warnings: [],
  stale: false,
};

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
  return {
    id: 'fa-1',
    userId: 'u-1',
    type: 'BANK' as never,
    name: 'Main',
    currency: AccountCurrency.USD,
    openingBalanceMinor: 0,
    openingBalanceMode: 'FRESH' as never,
    openingBalanceDate: null,
    archivedAt: null,
    bankName: 'ICBC',
    accountKind: 'SAVINGS' as never,
    issuer: null,
    creditLimitMinor: null,
    statementDay: null,
    paymentDueDay: null,
    broker: null,
    investmentType: null,
    walletAddress: null,
    casa: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  };
}

interface FakeRepo extends AccountRepositoryPort {
  findByIdSpy: ReturnType<typeof vi.fn>;
  rows: Map<string, FinancialAccount>;
}

function buildFakeRepo(row: FinancialAccount): FakeRepo {
  const rows = new Map<string, FinancialAccount>();
  rows.set(row.id, row);
  const findByIdSpy = vi.fn(async (userId: string, id: string) => {
    const r = rows.get(id);
    if (!r || r.userId !== userId) return null;
    return r;
  });
  return {
    list: vi.fn(async () => ({ data: [], nextCursor: null })),
    count: vi.fn(async () => 0),
    findById: findByIdSpy,
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
    unarchive: vi.fn(),
    findByIdSpy,
    rows,
  };
}

interface FakeFx {
  /** Captures the args passed to `accountService.getBalance(userId, id, displayCurrency, casa)`. */
  lastArgs: { userId: string; id: string; displayCurrency: string; casa: FxCasaString } | null;
  /** Spied on as the `accountService.getBalance` implementation. */
  getBalanceSpy: ReturnType<typeof vi.fn>;
}

function buildFakeFx(): FakeFx {
  const fake: FakeFx = {
    lastArgs: null,
    getBalanceSpy: vi.fn(),
  };
  fake.getBalanceSpy.mockImplementation(
    async (userId: string, id: string, displayCurrency: string, casa: FxCasaString) => {
      fake.lastArgs = { userId, id, displayCurrency, casa };
      return successResult;
    },
  );
  return fake;
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('getAccountBalanceAction', () => {
  // PR-3 T3.4: the action receives `defaultCasa` via deps
  // (the composition root reads `env.FX_DEFAULT_CASA` once at
  // startup). Each scenario wires the dep explicitly so the
  // function stays pure.

  it('returns 200 with the conversion on success', async () => {
    const repo = buildFakeRepo(makeRow());
    const fx = buildFakeFx();
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertOk(result);
    expect(result.data.display.amount).toBe(92000);
    expect(result.data.display.fxRate).toBe(0.92);
  });

  it('returns 503 when the service throws FX_UNAVAILABLE', async () => {
    const repo = buildFakeRepo(makeRow());
    const fx = buildFakeFx();
    fx.getBalanceSpy.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_UNAVAILABLE, message: 'no provider' }),
    );
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertFail(result);
    expect(result.status).toBe(503);
  });

  it('returns 409 when the service throws FX_NOT_SUPPORTED', async () => {
    const repo = buildFakeRepo(makeRow());
    const fx = buildFakeFx();
    fx.getBalanceSpy.mockRejectedValue(
      new AppError({ code: ErrorCode.FX_NOT_SUPPORTED, message: 'not supported' }),
    );
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    assertFail(result);
    expect(result.status).toBe(409);
  });

  it('returns 400 on a missing displayCurrency', async () => {
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: vi.fn(),
        getBalance: vi.fn(),
      } as never,
    };
    const result = await getAccountBalanceAction(deps, 'u-1', 'fa-1', {});
    assertFail(result);
    expect(result.status).toBe(400);
  });

  // -- PR-3 T3.4 RED cases: casa resolution at the action site --

  it('account.casa = null, defaultCasa unset -> service receives casa = "oficial" (implicit fallback)', async () => {
    const repo = buildFakeRepo(makeRow({ casa: null }));
    const fx = buildFakeFx();
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
      // defaultCasa intentionally omitted
    };
    await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    const expectedCasa: FxCasaString = 'oficial';
    expect(fx.lastArgs?.casa).toBe(expectedCasa);
  });

  it('account.casa = "BLUE" (UPPERCASE), defaultCasa = "oficial" -> service receives casa = "blue" (account wins)', async () => {
    const repo = buildFakeRepo(makeRow({ casa: 'BLUE' as never }));
    const fx = buildFakeFx();
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
      defaultCasa: 'oficial',
    };
    await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    const expectedCasa: FxCasaString = 'blue';
    expect(fx.lastArgs?.casa).toBe(expectedCasa);
  });

  it('account.casa = null, defaultCasa = "mep" -> service receives casa = "mep" (defaultCasa wins)', async () => {
    const repo = buildFakeRepo(makeRow({ casa: null }));
    const fx = buildFakeFx();
    const deps: GetAccountBalanceActionDeps = {
      accountService: {
        getById: repo.findById,
        getBalance: fx.getBalanceSpy,
      } as never,
      defaultCasa: 'mep',
    };
    await getAccountBalanceAction(deps, 'u-1', 'fa-1', {
      displayCurrency: AccountCurrency.EUR,
    });
    const expectedCasa: FxCasaString = 'mep';
    expect(fx.lastArgs?.casa).toBe(expectedCasa);
  });
});
