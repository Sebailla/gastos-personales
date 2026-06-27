/**
 * Hono integration test for the three reports routes
 * (T-RPT-208).
 *
 * Mirrors the slice-5 `app.transactions.test.ts` pattern:
 * each test builds a fresh `createHonoApp` with a hand-built
 * `HonoAppDeps` whose `reportsDeps` uses the
 * `InMemoryReportsRepository` fixture + a fake account
 * repository. The fixture composition reuses the
 * `InMemoryTransactionRepository` for the underlying data
 * source (per design §7.3).
 *
 * 7 cases:
 *   1. `GET /api/reports/monthly` without session → 401.
 *   2. `GET /api/reports/monthly?month=2026-06` with
 *      session + seed → 200 + correct DTO shape.
 *   3. `GET /api/reports/monthly?month=foo` → 400
 *      `VALIDATION_ERROR`.
 *   4. `GET /api/reports/breakdown?month=2026-06` → 200.
 *   5. `GET /api/reports/accounts/<cross-user-account>/flow`
 *      → 404 NOT_FOUND (REQ-RPT-4).
 *   6. `GET /api/reports/accounts/<own-account>/flow?month=2026-06`
 *      → 200.
 *   7. Range > 366 days → 400 `VALIDATION_ERROR` (BR-RPT-3).
 *
 * Per §11.4 of the design. The Hono integration test uses
 * in-memory deps — no Prisma round-trip — so it does not
 * require a real database.
 */

import { describe, it, expect, vi } from 'vitest';
import { createHonoApp, type HonoAppDeps } from '@/composition/create-hono-app';
import { AuthService } from '@/modules/auth/domain/services/auth.service';
import type { UserRepositoryPort } from '@/modules/auth/domain/interfaces/user.repository.port';
import type { PasswordHasherPort } from '@/modules/auth/domain/interfaces/password-hasher.port';
import { EventDispatcher } from '@/shared/events/event-dispatcher';
import { systemClock } from '@/shared/clock/system-clock';
import { AccountService } from '@/modules/accounts';
import { FxRateProviderStub } from '@/modules/accounts/infrastructure/external/fx-rate-provider.stub';
import { InMemoryTransactionRepository } from '@/modules/transactions/application/fixtures/in-memory-transaction.repository';
import { InMemoryReportsRepository } from './fixtures/reports-repository.inmemory';
import { AccountCurrency } from '@/shared/domain-kernel';
import type { AccountRepositoryPort, FinancialAccountFields } from '@/shared/domain-kernel';
import { logger } from '@/shared/logger/logger';
import type { ReportsActionDeps } from './actions/_shared';
import type { ReportSubscriberPort } from '@/modules/reports/domain/ports/report-subscriber.port';

const TEST_USER_ID = 'u-1';
const OWN_ACCOUNT_ID = 'c1111111111111111111111aa';
const CROSS_USER_ACCOUNT_ID = 'c3333333333333333333333cc';

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

function makeAccount(
  id: string,
  userId: string,
  overrides: Partial<FinancialAccountFields> = {},
): FinancialAccountFields {
  return {
    id,
    userId,
    currency: AccountCurrency.ARS,
    archivedAt: null,
    casa: null,
    ...overrides,
  };
}

function buildDeps(
  reportsDeps: ReportsActionDeps,
  authjsAuth: HonoAppDeps['authjsAuth'],
): HonoAppDeps {
  return {
    authService: buildAuthSvc(),
    authjsAuth,
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
    reportsDeps,
  };
}

function buildReportsDepsForRoutes(
  txRepo: InMemoryTransactionRepository,
  accountById: AccountRepositoryPort['findById'],
): ReportsActionDeps {
  return {
    reportsRepository: new InMemoryReportsRepository(txRepo.list.bind(txRepo)),
    accountRepository: { findById: accountById },
    subscriber: {
      onTransactionRecorded: () => () => undefined,
    } satisfies ReportSubscriberPort,
    clock: { now: () => new Date('2026-06-18T00:00:00.000Z') },
    logger,
    dispatcher: new EventDispatcher(),
  };
}

async function seedIncome(
  txRepo: InMemoryTransactionRepository,
  userId: string,
  accountId: string,
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
  category: string | null = null,
): Promise<void> {
  await txRepo.create(userId, {
    accountId,
    direction: 'INCOME',
    amountMinor,
    currency,
    memo: null,
    category,
    transactionDate: new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0)),
    convertedAmountMinor: amountMinor,
    convertedCurrency: currency,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
  });
}

async function seedExpense(
  txRepo: InMemoryTransactionRepository,
  userId: string,
  accountId: string,
  amountMinor: number,
  currency: AccountCurrency,
  day: number,
  category: string | null = null,
): Promise<void> {
  await txRepo.create(userId, {
    accountId,
    direction: 'EXPENSE',
    amountMinor,
    currency,
    memo: null,
    category,
    transactionDate: new Date(Date.UTC(2026, 5, day, 12, 0, 0, 0)),
    convertedAmountMinor: -amountMinor,
    convertedCurrency: currency,
    fxAsOfSnapshot: null,
    casaSnapshot: null,
  });
}

describe('GET /api/reports/monthly', () => {
  it('returns 401 without a session', async () => {
    const txRepo = new InMemoryTransactionRepository();
    const accountById = vi.fn(async () => null);
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => null),
    );
    const res = await app.request('/api/reports/monthly?month=2026-06');
    expect(res.status).toBe(401);
  });

  it('returns 200 + MonthlySummaryDTO when seeded for the caller', async () => {
    const txRepo = new InMemoryTransactionRepository();
    await seedIncome(
      txRepo,
      TEST_USER_ID,
      OWN_ACCOUNT_ID,
      100000,
      AccountCurrency.ARS,
      5,
      'Salary',
    );
    const accountById = vi.fn(async () => null);
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request('/api/reports/monthly?month=2026-06');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.totals).toEqual([
      {
        convertedCurrency: 'ARS',
        incomeMinor: 100000,
        expenseMinor: 0,
        netMinor: 100000,
        count: 1,
      },
    ]);
    expect(typeof body.data.generatedAt).toBe('string');
  });

  it('returns 400 VALIDATION_ERROR on a malformed month', async () => {
    const txRepo = new InMemoryTransactionRepository();
    const accountById = vi.fn(async () => null);
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request('/api/reports/monthly?month=foo');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/reports/breakdown', () => {
  it('returns 200 + CategoryBreakdownDTO when seeded for the caller', async () => {
    const txRepo = new InMemoryTransactionRepository();
    await seedExpense(txRepo, TEST_USER_ID, OWN_ACCOUNT_ID, 5000, AccountCurrency.ARS, 10, 'Food');
    const accountById = vi.fn(async () => null);
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request('/api/reports/breakdown?month=2026-06');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.buckets).toEqual([
      {
        category: 'Food',
        categoryNormalized: 'food',
        convertedCurrency: 'ARS',
        amountMinor: -5000,
        txCount: 1,
      },
    ]);
  });
});

describe('GET /api/reports/accounts/:accountId/flow', () => {
  it('returns 404 NOT_FOUND when the caller queries a cross-user account (REQ-RPT-4)', async () => {
    const txRepo = new InMemoryTransactionRepository();
    const accountById = vi.fn(async (userId: string, id: string) =>
      userId === TEST_USER_ID && id === OWN_ACCOUNT_ID
        ? makeAccount(OWN_ACCOUNT_ID, TEST_USER_ID)
        : null,
    );
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request(
      `/api/reports/accounts/${CROSS_USER_ACCOUNT_ID}/flow?month=2026-06`,
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 200 + AccountFlowDTO for the caller-owned account', async () => {
    const txRepo = new InMemoryTransactionRepository();
    await seedIncome(txRepo, TEST_USER_ID, OWN_ACCOUNT_ID, 100000, AccountCurrency.ARS, 5);
    const accountById = vi.fn(async (userId: string, id: string) =>
      userId === TEST_USER_ID && id === OWN_ACCOUNT_ID
        ? makeAccount(OWN_ACCOUNT_ID, TEST_USER_ID)
        : null,
    );
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request(`/api/reports/accounts/${OWN_ACCOUNT_ID}/flow?month=2026-06`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.days).toEqual([
      {
        date: '2026-06-05',
        netMinor: 100000,
        runningBalanceMinor: 100000,
        count: 1,
        convertedCurrency: 'ARS',
      },
    ]);
  });

  it('returns 400 VALIDATION_ERROR for a range > 366 days (BR-RPT-3)', async () => {
    const txRepo = new InMemoryTransactionRepository();
    const accountById = vi.fn(async (userId: string, id: string) =>
      userId === TEST_USER_ID && id === OWN_ACCOUNT_ID
        ? makeAccount(OWN_ACCOUNT_ID, TEST_USER_ID)
        : null,
    );
    const app = createHonoApp(
      buildDeps(buildReportsDepsForRoutes(txRepo, accountById), async () => ({
        user: { id: TEST_USER_ID, email: 'a@b.com' },
      })),
    );
    const res = await app.request(
      `/api/reports/accounts/${OWN_ACCOUNT_ID}/flow?fromDate=2026-01-01&toDate=2027-01-02`,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });
});
