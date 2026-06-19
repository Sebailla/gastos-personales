/**
 * Public surface of the `accounts` module. Other modules
 * (and the `app/` tree) import ONLY from this file. Nothing
 * else in the codebase reaches into the module's internals.
 *
 * Exports:
 * - `AccountService` — the domain orchestrator (constructed
 *   by the Hono `buildDefaultDeps()` in PR-B with the Prisma
 *   repository and the unconfigured FX provider).
 * - The 5 enums (`AccountType`, `AccountKind`,
 *   `InvestmentType`, `OpeningBalanceMode`, `AccountCurrency`)
 *   re-declared as plain TypeScript constants (no Prisma
 *   import — architecture-standards rule).
 * - The two ports (`AccountRepositoryPort`, `FxRateProvider`)
 *   declared in the domain layer; consumers inject concrete
 *   implementations.
 * - The `OpeningBalance` value object and `FinancialAccount`
 *   shape for use in application actions.
 *
 * The barrel does NOT export the entity `index.ts`
 * (the entities barrel) — consumers import the symbols they
 * need from here directly. The entities barrel exists so the
 * domain layer can re-export the same symbols without a circular
 * import through `src/modules/accounts/index.ts`.
 */

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

export { FxRateProviderUnconfigured } from './infrastructure/external/fx-rate-provider.unconfigured';
export { FxRateProviderStub } from './infrastructure/external/fx-rate-provider.stub';
export { AccountRepositoryPrisma } from './infrastructure/repositories/account.repository.prisma';
