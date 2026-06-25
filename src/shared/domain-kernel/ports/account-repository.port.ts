/**
 * Domain port: `AccountRepositoryPort`.
 *
 * Structural source of truth for the account-read contract.
 * Lifted from `src/modules/transactions/domain/interfaces/account.repository.port.mirror.ts`
 * which was a slice-3 local mirror to satisfy root AGENTS.md
 * §10.5 "Modules isolated". The canonical port lives at
 * `@/modules/accounts/domain/interfaces/account.repository.port.ts`
 * (the source of truth with the full surface for `AccountService`);
 * the kernel version here exposes only `findById` because that
 * is the only read the transactions BR-TX-5 pre-check needs.
 *
 * Adding a method to `AccountRepositoryPort` requires updating
 * BOTH this kernel port AND the canonical accounts port. Drift
 * detection happens at the type level: the Prisma adapter
 * satisfies the canonical port (full surface) and is structurally
 * compatible with this kernel port (minimum surface).
 */

import type { AccountCurrency } from '../enums/account-currency';
import type { AccountFxCasa } from '../enums/account-fx-casa';

/**
 * The fields the transactions slice reads from the parent
 * account. A subset of the canonical `FinancialAccount` (which
 * is a structural superset — every `FinancialAccount` is
 * assignable to this interface).
 */
export interface FinancialAccountFields {
  readonly id: string;
  readonly userId: string;
  readonly currency: AccountCurrency;
  readonly archivedAt: Date | null;
  readonly casa: AccountFxCasa | null;
}

/**
 * The minimum surface of `AccountRepositoryPort` consumed by
 * the transactions domain/application layer. The canonical
 * port in `@/modules/accounts` has the full surface; this
 * kernel port exposes only `findById` because that's all the
 * transactions BR-TX-5 pre-check needs.
 */
export interface AccountRepositoryPort {
  findById(userId: string, id: string): Promise<FinancialAccountFields | null>;
}
