/**
 * DTOs for the FinancialAccount response shape.
 *
 * The DTOs are the wire shape the API exposes. They are
 * the mirror of the domain `FinancialAccount` interface;
 * the conversion is mechanical but the DTO enforces the
 * shape at the OpenAPI / typed-client boundary.
 *
 * Per `api-design` skill: the response envelope is
 * `{ data: <dto> }` (success) or `{ error: { code, message, details? } }`
 * (failure). The DTOs here are the data side.
 */

import type { FinancialAccount } from '../../domain/entities/financial-account';
import { AccountFxCasa } from '../../domain/entities/financial-account';

/**
 * The DolarAPI wire form of `AccountFxCasa` (lowercase). The
 * fx-cache capability exposes this form on every wire shape
 * because the `FxRateProvider` and the cache key both speak it.
 * The Zod schemas (application/validation/account-fx-casa.schema.ts
 * for the Prisma boundary and
 * `src/modules/fx/domain/entities/fx-casa-string.schema.ts` for
 * the DolarAPI boundary) are the single source of truth for the
 * two cases; the DTO converts between them at the boundary.
 */
const ACCOUNT_FX_CASA_TO_WIRE: Readonly<Record<AccountFxCasa, string>> = {
  [AccountFxCasa.OFICIAL]: 'oficial',
  [AccountFxCasa.BLUE]: 'blue',
  [AccountFxCasa.MEP]: 'mep',
  [AccountFxCasa.CCL]: 'ccl',
  [AccountFxCasa.CRIPTO]: 'cripto',
  [AccountFxCasa.TARJETA]: 'tarjeta',
};

export interface FinancialAccountDto {
  id: string;
  userId: string;
  type: string;
  name: string;
  currency: string;
  openingBalanceMinor: number;
  openingBalanceMode: string;
  openingBalanceDate: string | null; // ISO 8601 or null
  archivedAt: string | null; // ISO 8601 or null
  bankName: string | null;
  accountKind: string | null;
  issuer: string | null;
  creditLimitMinor: number | null;
  statementDay: number | null;
  paymentDueDay: number | null;
  broker: string | null;
  investmentType: string | null;
  walletAddress: string | null;
  // fx-cache PR-2 T2.6 — REQ-FX-9. Wire form is the lowercase
  // DolarAPI casa (the form the `fx` capability consumes).
  // `null` means "inherit the global default".
  casa: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toFinancialAccountDto(row: FinancialAccount): FinancialAccountDto {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    name: row.name,
    currency: row.currency,
    openingBalanceMinor: row.openingBalanceMinor,
    openingBalanceMode: row.openingBalanceMode,
    openingBalanceDate: row.openingBalanceDate ? row.openingBalanceDate.toISOString() : null,
    archivedAt: row.archivedAt ? row.archivedAt.toISOString() : null,
    bankName: row.bankName,
    accountKind: row.accountKind,
    issuer: row.issuer,
    creditLimitMinor: row.creditLimitMinor,
    statementDay: row.statementDay,
    paymentDueDay: row.paymentDueDay,
    broker: row.broker,
    investmentType: row.investmentType,
    walletAddress: row.walletAddress,
    casa: row.casa === null ? null : ACCOUNT_FX_CASA_TO_WIRE[row.casa],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
