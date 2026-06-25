/**
 * DTOs for the Transaction response shape.
 *
 * Slice 3 binding. The DTO is the wire shape every API/UI
 * consumer reads — the same shape `toTransactionDto`
 * produces from the domain aggregate. Per the design §4.2:
 * the mapper carries no business logic, only mechanical
 * shape conversion:
 *   - `Date` fields → ISO 8601 strings.
 *   - `null` is preserved (the absence of an FX call is a
 *     meaningful signal to the UI).
 *   - The `casaSnapshot` enum is converted to the lowercase
 *     DolarAPI wire form (matching the `financial-account.dto.ts`
 *     pattern). The UPPERCASE Prisma form is internal.
 *
 * Every field is `readonly` (immutability at the type level).
 * The DTO surface mirrors the public output; consumers
 * (UI, future `reports`, future `snapshots`) never see the
 * domain aggregate directly.
 */

import { AccountCurrency, AccountFxCasa } from '@/shared/domain-kernel';
import type { Transaction } from '../../domain/entities/transaction';

/**
 * Lowercase DolarAPI wire form for the `casaSnapshot` field.
 * The fx-cache capability exposes this form on every wire
 * shape because the `FxRateProvider` and the cache key both
 * speak it. The values are kept in sync with the canonical
 * source at `@/modules/fx` via the design §2.1 "no drift"
 * contract; the slice-3 InMemoryRepository never produces a
 * `casaSnapshot` value outside the 6-entry enum.
 */
const ACCOUNT_FX_CASA_TO_WIRE: Readonly<Record<AccountFxCasa, string>> = {
  [AccountFxCasa.OFICIAL]: 'oficial',
  [AccountFxCasa.BLUE]: 'blue',
  [AccountFxCasa.MEP]: 'mep',
  [AccountFxCasa.CCL]: 'ccl',
  [AccountFxCasa.CRIPTO]: 'cripto',
  [AccountFxCasa.TARJETA]: 'tarjeta',
};

export interface TransactionDTO {
  readonly id: string;
  readonly userId: string;
  readonly accountId: string;
  readonly direction: string;
  readonly amountMinor: number;
  readonly currency: AccountCurrency;
  readonly memo: string | null;
  readonly category: string | null;
  readonly transactionDate: string; // ISO 8601
  readonly convertedAmountMinor: number;
  readonly convertedCurrency: AccountCurrency;
  readonly fxAsOfSnapshot: string | null; // ISO 8601 or null
  readonly casaSnapshot: string | null; // lowercase DolarAPI form or null
  readonly createdAt: string; // ISO 8601
  readonly updatedAt: string; // ISO 8601
}

/**
 * Convert a domain `Transaction` aggregate to the public DTO.
 * Pure function: no I/O, no clock, no FX call. The action
 * layer maps the result to the wire envelope.
 */
export function toTransactionDto(row: Transaction): TransactionDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    direction: row.direction,
    amountMinor: row.amountMinor,
    currency: row.currency,
    memo: row.memo,
    category: row.category,
    transactionDate: row.transactionDate.toISOString(),
    convertedAmountMinor: row.convertedAmountMinor,
    convertedCurrency: row.convertedCurrency,
    fxAsOfSnapshot: row.fxAsOfSnapshot ? row.fxAsOfSnapshot.toISOString() : null,
    casaSnapshot: row.casaSnapshot === null ? null : ACCOUNT_FX_CASA_TO_WIRE[row.casaSnapshot],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
