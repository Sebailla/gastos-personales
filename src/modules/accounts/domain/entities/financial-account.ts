/**
 * Domain entity: FinancialAccount.
 *
 * Pure-TS mirror of the Prisma model declared in
 * `prisma/schema.prisma` (added by T-A1 + T-A2 of
 * `accounts-ledger`). The domain layer NEVER imports from
 * `@prisma/client`; this file is the canonical shape the
 * domain services and the application actions consume.
 *
 * The 5 enums are re-declared as `as const` objects so they
 * can be used in TypeScript's discriminated-union pattern
 * (the per-type Zod schema in PR-B relies on this for
 * `z.discriminatedUnion('type', [...])`).
 *
 * Cross-module invariant: every `FinancialAccount.userId`
 * references a row in the auth-owned `User` table (see
 * `openspec/specs/auth/spec.md`, BR-AUTH-1). The application
 * layer never accepts `userId` from a request body; the
 * session is the source of truth.
 *
 * The shape mirrors the Prisma row one-to-one; the only
 * deviation is the type-guard below, which is not part of
 * Prisma's generated client but is required by the spec
 * scenario "type-specific field set for the wrong type is
 * rejected" (the guard validates the structural shape; the
 * per-type field validation lives in the Zod schema in PR-B).
 */

export const AccountType = {
  BANK: 'BANK',
  CREDIT: 'CREDIT',
  INVESTMENT: 'INVESTMENT',
  CRYPTO: 'CRYPTO',
  CASH: 'CASH',
  OTHER: 'OTHER',
} as const;
export type AccountType = (typeof AccountType)[keyof typeof AccountType];

export const AccountKind = {
  SAVINGS: 'SAVINGS',
  CHECKING: 'CHECKING',
} as const;
export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

export const InvestmentType = {
  STOCKS: 'STOCKS',
  BONDS: 'BONDS',
  MUTUAL_FUNDS: 'MUTUAL_FUNDS',
  CERTS_OF_DEPOSIT: 'CERTS_OF_DEPOSIT',
  OTHER: 'OTHER',
} as const;
export type InvestmentType = (typeof InvestmentType)[keyof typeof InvestmentType];

export const OpeningBalanceMode = {
  FRESH: 'FRESH',
  HISTORICAL: 'HISTORICAL',
} as const;
export type OpeningBalanceMode = (typeof OpeningBalanceMode)[keyof typeof OpeningBalanceMode];

export const AccountCurrency = {
  ARS: 'ARS',
  USD: 'USD',
  EUR: 'EUR',
} as const;
export type AccountCurrency = (typeof AccountCurrency)[keyof typeof AccountCurrency];

// fx-cache PR-2 — REQ-FX-9. Per-account casa selection.
// Mirrors the Prisma `AccountFxCasa` enum (`prisma/schema.prisma`)
// with UPPERCASE values per the project's existing 5-enum
// convention. The DolarAPI wire format is lowercase; the
// lowercase ↔ uppercase mapping lives at the Zod / DTO layer
// (`application/validation/account-fx-casa.schema.ts` and
// `toFinancialAccountDto`). The domain layer never imports
// from `@prisma/client`. `NULL` in the Prisma column means
// "inherit the global default" (`env.FX_DEFAULT_CASA`,
// defaulting to `'oficial'`); the type is nullable here so
// the same shape works for existing rows post-migration.
export const AccountFxCasa = {
  OFICIAL: 'OFICIAL',
  BLUE: 'BLUE',
  MEP: 'MEP',
  CCL: 'CCL',
  CRIPTO: 'CRIPTO',
  TARJETA: 'TARJETA',
} as const;
export type AccountFxCasa = (typeof AccountFxCasa)[keyof typeof AccountFxCasa];

/**
 * Structural shape of a FinancialAccount row, as the domain
 * layer sees it. Matches the Prisma model 1:1; the
 * type-specific optional fields (`bankName`, `issuer`, etc.)
 * are nullable so the same shape works for every `AccountType`.
 */
export interface FinancialAccount {
  readonly id: string;
  readonly userId: string;
  readonly type: AccountType;
  readonly name: string;
  readonly currency: AccountCurrency;
  readonly openingBalanceMinor: number;
  readonly openingBalanceMode: OpeningBalanceMode;
  readonly openingBalanceDate: Date | null;
  readonly archivedAt: Date | null;

  // Type-specific fields (populated only for the relevant `type`).
  // The Zod schema in PR-B enforces the per-type visibility rule;
  // the domain layer treats them as nullable so a single shape works.
  readonly bankName: string | null;
  readonly accountKind: AccountKind | null;
  readonly issuer: string | null;
  readonly creditLimitMinor: number | null;
  readonly statementDay: number | null;
  readonly paymentDueDay: number | null;
  readonly broker: string | null;
  readonly investmentType: InvestmentType | null;
  readonly walletAddress: string | null;

  // fx-cache PR-2 — per-account casa selection (REQ-FX-9).
  // Nullable: existing rows after `add_account_fx_casa` migrate
  // land with casa = NULL and render the inherited global
  // default (`env.FX_DEFAULT_CASA`, default `'oficial'`).
  // The lowercase DolarAPI wire form (`oficial` / `blue` / …)
  // appears at the API boundary; the domain + DTO keep the
  // uppercase Prisma form. The mapping is centralized in
  // `application/validation/account-fx-casa.schema.ts` and
  // `application/dto/financial-account.dto.ts`.
  readonly casa: AccountFxCasa | null;

  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Structural type-guard for FinancialAccount. Cheap, side-effect-free,
 * safe to call at API boundaries when an untrusted object could be
 * passed where a row is expected. Performs no per-type-field
 * validation (that's the Zod schema's job in PR-B).
 *
 * The Date|null checks on `openingBalanceDate`, `archivedAt`,
 * `createdAt`, and `updatedAt` are the minimal invariants a
 * caller can rely on without re-parsing every field.
 */
export function isFinancialAccount(obj: unknown): obj is FinancialAccount {
  if (obj === null || typeof obj !== 'object') return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string') return false;
  if (typeof o.userId !== 'string') return false;
  if (typeof o.type !== 'string' || !(o.type in AccountType)) return false;
  if (typeof o.name !== 'string') return false;
  if (typeof o.currency !== 'string' || !(o.currency in AccountCurrency)) return false;
  if (typeof o.openingBalanceMinor !== 'number') return false;
  if (typeof o.openingBalanceMode !== 'string' || !(o.openingBalanceMode in OpeningBalanceMode))
    return false;
  if (!(o.openingBalanceDate === null || o.openingBalanceDate instanceof Date)) return false;
  if (!(o.archivedAt === null || o.archivedAt instanceof Date)) return false;
  if (!(o.createdAt instanceof Date)) return false;
  if (!(o.updatedAt instanceof Date)) return false;
  return true;
}
