/**
 * Local mirror: `FxRateProvider` port.
 *
 * Slice 2 deviation (AGENTS.md §10.5 "Modules isolated" + slice
 * prompt rule #9: "No imports from `@/modules/accounts` in
 * domain code"): the `transactions` domain cannot import
 * `FxRateProvider` directly from `@/modules/accounts`. The
 * canonical port lives at
 * `src/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`
 * and is re-exported through the accounts barrel
 * (`@/modules/accounts`). The accounts barrel import is
 * permitted at the application/infra boundary only.
 *
 * The slice-2 transactions domain needs the `getDisplayAmount`
 * contract for the FX snapshot at write time (REQ-TX-12,
 * BR-TX-6). Rather than break the modules-isolated rule (root
 * AGENTS.md §10.5) by importing from the accounts barrel, this
 * file mirrors the port as a structural type — just the methods
 * the domain needs, no PII or wire-format surface.
 *
 * The accounts port is the source of truth (the slice-2 helper
 * `convertAndSnapshot` builds the `FxConversionRequest` shape
 * inline). The values stay in sync via the slice-1 design
 * §2.1 "no drift" contract and the apply-progress deviation log.
 * A future shared-kernel refactor (move `FxRateProvider` to
 * `@/shared/domain/ports/`) will collapse the two; until then,
 * this local mirror is the agreed minimum surface for the
 * transactions domain.
 */

import type { AccountCurrency } from '../entities/transaction';

/**
 * Lowercase DolarAPI casa enum. The DolarAPI wire format is
 * lowercase; the Prisma `AccountFxCasa` enum is UPPERCASE per
 * Prisma convention. This is the structural source of truth for
 * the lowercase form on the transactions side; the canonical
 * Zod schema lives in `@/modules/fx`. The two MUST stay in sync.
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

/**
 * The FX rate provider port the transactions domain consumes.
 * Structural mirror of the accounts port
 * (`@/modules/accounts/domain/interfaces/fx-rate-provider.port.ts`);
 * see the file-level comment for the drift contract.
 */
export interface FxRateProvider {
  getDisplayAmount(request: FxConversionRequest): Promise<FxConversionResult>;
}
