/**
 * Barrel for the shared domain kernel.
 *
 * The domain kernel holds cross-cutting primitives (ports +
 * enums) that multiple bounded contexts need. Modules can
 * import from `@/shared/domain-kernel` without violating
 * root AGENTS.md §10.5 "Modules isolated" — the kernel is
 * NOT a module; it is a structural primitive shared across the
 * codebase.
 *
 * Consumers should import from this barrel (one level deep),
 * not from `@/shared/domain-kernel/ports/...` or
 * `@/shared/domain-kernel/enums/...` (deep paths leak the
 * internal structure).
 *
 * The enum exports are dual-purpose:
 * - The TYPE `AccountCurrency` is the structural type used in
 *   field declarations.
 * - The VALUE `AccountCurrency.ARS` is the runtime const object
 *   used in Record maps, Object.values, etc.
 *
 * Both are exposed under the same name from this barrel
 * (the type comes from the underlying const + `typeof`
 * pattern in each enum file). Downstream code uses the type as
 * a field type and the value as a runtime lookup, with the
 * same import name.
 */

export { AccountCurrency } from './enums/account-currency';
export type { AccountCurrency as AccountCurrencyType } from './enums/account-currency';

export { AccountFxCasa } from './enums/account-fx-casa';
export type { AccountFxCasa as AccountFxCasaType } from './enums/account-fx-casa';

export type {
  FxRateProvider,
  FxConversionRequest,
  FxConversionResult,
  FxCasaString,
} from './ports/fx-rate-provider.port';

export type {
  AccountRepositoryPort,
  FinancialAccountFields,
} from './ports/account-repository.port';
