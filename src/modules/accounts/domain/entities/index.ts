/**
 * Public barrel for the accounts module's domain entities.
 * Re-exports the FinancialAccount shape and the 5 enums for
 * use by the domain services, the application actions, and
 * the infrastructure adapters.
 *
 * This barrel is part of the module's public surface; the
 * `src/modules/accounts/index.ts` root barrel re-exports
 * these symbols to consumers outside the module.
 */

export {
  AccountType,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountCurrency,
  isFinancialAccount,
} from './financial-account';
export type {
  AccountType as AccountTypeT,
  AccountKind as AccountKindT,
  InvestmentType as InvestmentTypeT,
  OpeningBalanceMode as OpeningBalanceModeT,
  AccountCurrency as AccountCurrencyT,
  FinancialAccount,
} from './financial-account';
