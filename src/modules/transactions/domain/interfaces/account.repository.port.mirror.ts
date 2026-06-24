/**
 * Local mirror: `AccountRepositoryPort`.
 *
 * Slice-3 deviation (root AGENTS.md §10.5 "Modules isolated"
 * + slice prompt rule #9): the `transactions` application
 * layer needs to load the parent `FinancialAccount` to
 * enforce BR-TX-5 (archived-account rejection) at the create
 * action. The canonical port lives at
 * `@/modules/accounts/domain/interfaces/account.repository.port.ts`
 * and is re-exported through the accounts barrel. The
 * accounts barrel import is permitted at the application
 * boundary only — the same pattern the slice-2 `FxRateProvider`
 * mirror established for the domain layer.
 *
 * This file mirrors the port as a structural type (just the
 * methods the slice-3 actions need: `findById` for the BR-TX-5
 * pre-check). The accounts port is the source of truth; the
 * values stay in sync via the slice-1 design §2.1 "no drift"
 * contract. A future shared-kernel refactor (move the port
 * to `@/shared/domain/ports/`) will collapse the two.
 */

/**
 * Local mirror module for the cross-module `AccountRepositoryPort`.
 *
 * Slice-3 deviation (root AGENTS.md §10.5 "Modules isolated"):
 * the `transactions` application layer needs to load the
 * parent `FinancialAccount` to enforce BR-TX-5
 * (archived-account rejection) at the create action. The
 * canonical port lives at
 * `@/modules/accounts/domain/interfaces/account.repository.port.ts`
 * and is re-exported through the accounts barrel. The
 * accounts barrel import would be a direct cross-module
 * dependency; the local mirror preserves the modules-
 * isolated rule (root AGENTS.md §10.5 — no exceptions,
 * even when the user asks). The slice-2 transactions
 * domain established the same pattern for `FxRateProvider`
 * (see `transactions/domain/interfaces/fx-rate-provider.port.ts`).
 *
 * The accounts domain is the source of truth; the slice-3
 * application layer uses `AccountRepositoryPortMirror` and
 * the canonical `FinancialAccount` is structurally
 * assignable to it (every required field is present).
 * Slice 4 swaps this for the real port when the service
 * layer lands.
 */

import type { AccountCurrency, AccountFxCasa } from '../entities/transaction';

/**
 * The fields the slice-3 create action reads from the parent
 * account. Mirrored here (instead of imported from
 * `@/modules/accounts`) to preserve the modules-isolated
 * rule. The accounts domain's `FinancialAccount` is a
 * structural superset — every `FinancialAccount` is
 * assignable to this interface.
 */
export interface FinancialAccountMirrorFields {
  readonly id: string;
  readonly userId: string;
  readonly currency: AccountCurrency;
  readonly archivedAt: Date | null;
  readonly casa: AccountFxCasa | null;
}

/**
 * The slice-3 surface of the `AccountRepositoryPort`. Mirrors
 * `findById` (the only method the slice-3 create action
 * needs); the slice-4 service layer extends the surface when
 * it adds the account-archived-event listener.
 *
 * The slice-3 mock returns the canonical `FinancialAccount`;
 * the index signature `[extra: string]: unknown` is omitted
 * here (the mirror accepts any object that has the required
 * fields) so a canonical `FinancialAccount` (with its
 * additional fields) is assignable to the `FinancialAccountMirror`
 * type the action consumes.
 */
export interface AccountRepositoryPortMirror {
  findById(userId: string, id: string): Promise<FinancialAccountMirrorFields | null>;
}
