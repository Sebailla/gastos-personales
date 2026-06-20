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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
