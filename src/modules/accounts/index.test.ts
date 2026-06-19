/**
 * Compile-time check that the `accounts` module's public
 * surface resolves. Unlike the auth module's `index.test.ts`
 * (which uses a static text check because next-auth's import
 * chain breaks in plain Vitest), the accounts module has no
 * upstream transitive imports, so a real `import` works.
 *
 * If any of the re-exports are broken (missing source file,
 * bad path, name mismatch), TypeScript fails the build.
 * The runtime check below asserts the symbols are present
 * and `AccountService` is constructible.
 */

import { describe, it, expect } from 'vitest';
import {
  AccountService,
  AccountType,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountCurrency,
  OpeningBalance,
} from './index';
import type { FinancialAccount, AccountRepositoryPort, FxRateProvider } from './index';

describe('accounts module public API (compile-time)', () => {
  it('re-exports AccountService as a constructible class', () => {
    expect(typeof AccountService).toBe('function');
    const fakeRepo = {} as AccountRepositoryPort;
    const fakeFx = {} as FxRateProvider;
    const svc = new AccountService(fakeRepo, fakeFx);
    expect(svc).toBeInstanceOf(AccountService);
  });

  it('re-exports the 5 enums with their string values', () => {
    expect(AccountType.BANK).toBe('BANK');
    expect(AccountKind.SAVINGS).toBe('SAVINGS');
    expect(InvestmentType.STOCKS).toBe('STOCKS');
    expect(OpeningBalanceMode.FRESH).toBe('FRESH');
    expect(AccountCurrency.USD).toBe('USD');
  });

  it('re-exports the OpeningBalance factory', () => {
    expect(typeof OpeningBalance.fresh).toBe('function');
    const ob = OpeningBalance.fresh(0);
    expect(ob.mode).toBe('FRESH');
    expect(ob.amountMinor).toBe(0);
    expect(ob.date).toBeNull();
  });

  it('re-exports the FinancialAccount type (compile-time only)', () => {
    // The type-only assertion — if FinancialAccount is not exported,
    // this line fails to compile.
    const _check: FinancialAccount | null = null;
    expect(_check).toBeNull();
  });
});
