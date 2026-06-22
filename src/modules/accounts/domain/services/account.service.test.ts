import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountService } from './account.service';
import type {
  AccountRepositoryPort,
  CreateFinancialAccountInput,
  ListAccountsOptions,
  UpdateFinancialAccountPatch,
} from '../interfaces/account.repository.port';
import type {
  FxConversionRequest,
  FxConversionResult,
  FxRateProvider,
} from '../interfaces/fx-rate-provider.port';
import {
  AccountCurrency,
  AccountKind,
  AccountType,
  OpeningBalanceMode,
  type FinancialAccount,
} from '../entities/financial-account';
import { AppError } from '@/shared/errors/app-error';
import { systemClock } from '@/shared/clock/system-clock';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeRow(overrides: Partial<FinancialAccount> = {}): FinancialAccount {
  return {
    id: 'fa-1',
    userId: 'u-1',
    type: AccountType.BANK,
    name: 'Main savings',
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
    casa: null,
    createdAt: new Date('2026-06-18T00:00:00.000Z'),
    updatedAt: new Date('2026-06-18T00:00:00.000Z'),
    ...overrides,
  };
}

const baseInput: CreateFinancialAccountInput = {
  type: AccountType.BANK,
  name: 'Main savings',
  currency: AccountCurrency.USD,
  openingBalanceMinor: 0,
  openingBalanceMode: OpeningBalanceMode.FRESH,
  openingBalanceDate: null,
  bankName: 'ICBC',
  accountKind: AccountKind.SAVINGS,
  issuer: null,
  creditLimitMinor: null,
  statementDay: null,
  paymentDueDay: null,
  broker: null,
  investmentType: null,
  walletAddress: null,
};

// ---------------------------------------------------------------------------
// Fake port implementations
// ---------------------------------------------------------------------------

interface FakeRepo extends AccountRepositoryPort {
  listSpy: ReturnType<typeof vi.fn>;
  countSpy: ReturnType<typeof vi.fn>;
  findByIdSpy: ReturnType<typeof vi.fn>;
  createSpy: ReturnType<typeof vi.fn>;
  updateSpy: ReturnType<typeof vi.fn>;
  archiveSpy: ReturnType<typeof vi.fn>;
  unarchiveSpy: ReturnType<typeof vi.fn>;
  rows: Map<string, FinancialAccount>;
}

function buildFakeRepo(rows: FinancialAccount[] = []): FakeRepo {
  const rowsMap = new Map<string, FinancialAccount>();
  for (const r of rows) rowsMap.set(r.id, r);

  const listSpy = vi.fn(async (_userId: string, _opts: ListAccountsOptions) => ({
    data: Array.from(rowsMap.values()),
    nextCursor: null,
  }));
  const countSpy = vi.fn(async (_userId: string) => rowsMap.size);
  const findByIdSpy = vi.fn(async (userId: string, id: string) => {
    const r = rowsMap.get(id);
    if (!r) return null;
    if (r.userId !== userId) return null; // cross-user guard
    return r;
  });
  const createSpy = vi.fn(async (userId: string, input: CreateFinancialAccountInput) =>
    makeRow({
      id: `fa-${rowsMap.size + 1}`,
      userId,
      type: input.type,
      name: input.name,
      currency: input.currency,
    }),
  );
  const updateSpy = vi.fn(
    async (userId: string, id: string, patch: UpdateFinancialAccountPatch) => {
      const r = rowsMap.get(id);
      if (!r || r.userId !== userId) return null;
      const updated = { ...r, ...patch, updatedAt: new Date() };
      rowsMap.set(id, updated);
      return updated;
    },
  );
  const archiveSpy = vi.fn(async (userId: string, id: string, _clock?: { now: () => Date }) => {
    const r = rowsMap.get(id);
    if (!r || r.userId !== userId) return null;
    const updated = { ...r, archivedAt: new Date() };
    rowsMap.set(id, updated);
    return updated;
  });
  const unarchiveSpy = vi.fn(async (userId: string, id: string, _clock?: { now: () => Date }) => {
    const r = rowsMap.get(id);
    if (!r || r.userId !== userId) return null;
    const updated = { ...r, archivedAt: null };
    rowsMap.set(id, updated);
    return updated;
  });

  return {
    list: listSpy,
    count: countSpy,
    findById: findByIdSpy,
    create: createSpy,
    update: updateSpy,
    archive: archiveSpy,
    unarchive: unarchiveSpy,
    listSpy,
    countSpy,
    findByIdSpy,
    createSpy,
    updateSpy,
    archiveSpy,
    unarchiveSpy,
    rows: rowsMap,
  };
}

interface FakeFx {
  getDisplayAmount: FxRateProvider['getDisplayAmount'];
  getDisplayAmountSpy: ReturnType<typeof vi.fn>;
  errorToThrow: AppError | null;
}

function buildFakeFx(): FakeFx {
  // F-16: dropped `resultToReturn` from the default
  // shape; tests that need to assert a specific result
  // set the spy's return value inline. The default
  // success result lives in `getDisplayAmountSpy`'s
  // implementation below.
  const fake: FakeFx = {
    errorToThrow: null,
    getDisplayAmountSpy: vi.fn(),
    getDisplayAmount: (_request: FxConversionRequest): Promise<FxConversionResult> =>
      Promise.reject(new Error('not initialized')),
  };
  fake.getDisplayAmountSpy.mockImplementation(
    async (request: FxConversionRequest): Promise<FxConversionResult> => {
      if (fake.errorToThrow) throw fake.errorToThrow;
      void request;
      const defaultResult: FxConversionResult = {
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
      return defaultResult;
    },
  );
  fake.getDisplayAmount = fake.getDisplayAmountSpy;
  return fake;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AccountService.create', () => {
  let repo: FakeRepo;
  let fx: FakeFx;
  let svc: AccountService;

  beforeEach(() => {
    repo = buildFakeRepo();
    fx = buildFakeFx();
    svc = new AccountService(repo, fx, systemClock);
  });

  it('calls repo.create(userId, input) and returns the row', async () => {
    const result = await svc.create('u-1', baseInput);
    expect(result.id).toBe('fa-1');
    expect(result.userId).toBe('u-1');
    expect(repo.createSpy).toHaveBeenCalledTimes(1);
    expect(repo.createSpy).toHaveBeenCalledWith('u-1', baseInput);
  });
});

describe('AccountService.list', () => {
  it('calls repo.list(userId, opts) and returns the page', async () => {
    const row = makeRow({ id: 'fa-1' });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    const page = await svc.list('u-1', { limit: 20, archivedAt: null });
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.id).toBe('fa-1');
    expect(repo.listSpy).toHaveBeenCalledTimes(1);
    expect(repo.listSpy).toHaveBeenCalledWith('u-1', { limit: 20, archivedAt: null });
  });
});

describe('AccountService.getById', () => {
  it('returns the row when found and owned by userId', async () => {
    const row = makeRow({ id: 'fa-1', userId: 'u-1' });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    const got = await svc.getById('u-1', 'fa-1');
    expect(got.id).toBe('fa-1');
  });

  it('throws AppError(NOT_FOUND) when the row does not exist', async () => {
    const repo = buildFakeRepo();
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    await expect(svc.getById('u-1', 'does-not-exist')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      statusCode: 404,
    });
  });

  it('throws AppError(NOT_FOUND) on cross-user access (existence not leaked)', async () => {
    const row = makeRow({ id: 'fa-1', userId: 'u-2' }); // owned by u-2
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    await expect(svc.getById('u-1', 'fa-1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('AccountService.getBalance', () => {
  it('calls fx.getDisplayAmount(...) and returns the result (native untouched)', async () => {
    const row = makeRow({
      id: 'fa-1',
      currency: AccountCurrency.USD,
      openingBalanceMinor: 100000,
    });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    const result = await svc.getBalance('u-1', 'fa-1', AccountCurrency.EUR, 'oficial');
    expect(result.display.amount).toBe(92000);
    expect(result.native.amount).toBe(100000); // native unchanged
    expect(fx.getDisplayAmountSpy).toHaveBeenCalledTimes(1);
  });

  it('propagates AppError(FX_UNAVAILABLE) from the FX port', async () => {
    const row = makeRow({ id: 'fa-1', currency: AccountCurrency.USD });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    fx.errorToThrow = new AppError({
      code: 'FX_UNAVAILABLE',
      message: 'fx down',
    });
    const svc = new AccountService(repo, fx, systemClock);

    await expect(
      svc.getBalance('u-1', 'fa-1', AccountCurrency.EUR, 'oficial'),
    ).rejects.toMatchObject({
      code: 'FX_UNAVAILABLE',
    });
  });

  it('propagates the clock time as FxConversionRequest.asOf', async () => {
    const row = makeRow({
      id: 'fa-1',
      currency: AccountCurrency.USD,
      openingBalanceMinor: 100000,
    });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const fixed = new Date('2026-06-19T12:00:00.000Z');
    const svc = new AccountService(repo, fx, { now: () => fixed });

    await svc.getBalance('u-1', 'fa-1', AccountCurrency.EUR, 'oficial');

    expect(fx.getDisplayAmountSpy).toHaveBeenCalledWith(expect.objectContaining({ asOf: fixed }));
  });

  // PR-3 T3.3 RED cases
  it('threads the casa into the FxConversionRequest forwarded to the FX port', async () => {
    const row = makeRow({
      id: 'fa-1',
      currency: AccountCurrency.USD,
      openingBalanceMinor: 100000,
      casa: null,
    });
    const repo = buildFakeRepo([row]);
    const fx = buildFakeFx();
    const svc = new AccountService(repo, fx, systemClock);

    await svc.getBalance('u-1', 'fa-1', AccountCurrency.EUR, 'blue');

    expect(fx.getDisplayAmountSpy).toHaveBeenCalledWith(
      expect.objectContaining({ casa: 'blue' }),
    );
  });

  it('does NOT read process.env.FX_DEFAULT_CASA at request time (env var absence does not change the resolved casa)', async () => {
    // PR-3 T3.3 triangulation: the service MUST NOT consult the
    // env. It only forwards the casa passed in by the action
    // layer. We delete the env var and assert the call carries
    // the caller-supplied casa.
    const originalEnv = process.env.FX_DEFAULT_CASA;
    delete process.env.FX_DEFAULT_CASA;
    try {
      const row = makeRow({
        id: 'fa-1',
        currency: AccountCurrency.USD,
        openingBalanceMinor: 100000,
        casa: null,
      });
      const repo = buildFakeRepo([row]);
      const fx = buildFakeFx();
      const svc = new AccountService(repo, fx, systemClock);

      await svc.getBalance('u-1', 'fa-1', AccountCurrency.EUR, 'mep');

      expect(fx.getDisplayAmountSpy).toHaveBeenCalledWith(
        expect.objectContaining({ casa: 'mep' }),
      );
    } finally {
      if (originalEnv !== undefined) process.env.FX_DEFAULT_CASA = originalEnv;
    }
  });
});
