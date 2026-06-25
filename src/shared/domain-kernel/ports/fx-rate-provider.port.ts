/**
 * Domain port: `FxRateProvider`.
 *
 * Structural source of truth for the FX conversion contract.
 * Lifted from `src/modules/transactions/domain/interfaces/fx-rate-provider.port.ts`
 * which was a local mirror to satisfy root AGENTS.md §10.5
 * "Modules isolated". The canonical port lives at
 * `@/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
 * (the source of truth that the accounts module uses for
 * `AccountService`); the kernel version here is the
 * structural minimum that the transactions FX-snapshot path
 * (`convertAndSnapshot`) consumes.
 *
 * Adding a method to `FxRateProvider` requires updating BOTH
 * this kernel port AND the canonical accounts port. Drift
 * detection happens at the type level: a `PrismaFxRateProvider`
 * implementation satisfies the accounts port (which has the
 * full surface) and is structurally compatible with this
 * kernel port (which has the minimum surface).
 */

import type { AccountCurrency } from '../enums/account-currency';

/**
 * Lowercase DolarAPI casa enum. The DolarAPI wire format is
 * lowercase; the Prisma `AccountFxCasa` enum is UPPERCASE per
 * Prisma convention. This is the structural source of truth for
 * the lowercase form on the shared side; the canonical Zod
 * schema lives in `@/modules/fx`. The two MUST stay in sync.
 */
export type FxCasaString = 'oficial' | 'blue' | 'mep' | 'ccl' | 'cripto' | 'tarjeta';

export interface FxConversionRequest {
  readonly native: {
    readonly amount: number;
    readonly currency: AccountCurrency;
  };
  readonly displayCurrency: AccountCurrency;
  readonly asOf: Date;
  readonly casa: FxCasaString;
}

export interface FxConversionResult {
  readonly native: { readonly amount: number; readonly currency: AccountCurrency };
  readonly display: {
    readonly amount: number;
    readonly currency: AccountCurrency;
    readonly fxRate: number;
    readonly fxAsOf: Date;
  };
  readonly stale: boolean;
  readonly warnings?: string[];
}

export interface FxRateProvider {
  getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>;
}
