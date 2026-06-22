/**
 * accountCreateSchema — Zod discriminated union for the
 * `POST /api/accounts` request body.
 *
 * The schema is a `z.discriminatedUnion('type', [...])`
 * over the 6 `AccountType` values. Each per-type refinement
 * enforces the type-specific field set (rejects
 * `walletAddress` on `BANK`, etc.) so the spec scenario
 * "type-specific field set for the wrong type is rejected
 * -> 400 VALIDATION_ERROR" holds.
 *
 * Per BR-ACC-16 / Decision 7: `openingBalanceMinor >= 0`.
 * Per the spec: `openingBalanceDate` is required iff mode
 * is `HISTORICAL`; the per-type schema enforces this.
 *
 * The schema is intentionally structural: it validates the
 * wire shape (request body). The action layer translates
 * the parsed object into the domain input type
 * (`CreateFinancialAccountInput`).
 */

import { z } from 'zod';
import {
  AccountCurrency,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountType,
} from '../../domain/entities/financial-account';
import { accountFxCasaSchema } from './account-fx-casa.schema';

const accountCurrencySchema = z.enum([
  AccountCurrency.ARS,
  AccountCurrency.USD,
  AccountCurrency.EUR,
]);

const openingBalanceSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal(OpeningBalanceMode.FRESH),
    amountMinor: z.number().int().min(0),
    date: z.null().optional(),
  }),
  z.object({
    mode: z.literal(OpeningBalanceMode.HISTORICAL),
    amountMinor: z.number().int().min(0),
    date: z.coerce.date(),
  }),
]);

const baseFields = {
  name: z.string().min(1).max(80),
  currency: accountCurrencySchema,
  openingBalance: openingBalanceSchema,
  // fx-cache PR-2 T2.4 — REQ-FX-9. Optional nullable casa
  // selection. `undefined` and `null` both map to `column =
  // NULL` on `FinancialAccount.casa` (the user inherits the
  // global default at the action site). The schema accepts
  // the UPPERCASE Prisma form; the lowercase DolarAPI wire
  // form is rejected (the DolarAPI form lives at
  // `fx-casa-string.schema.ts` in the `fx` module).
  casa: accountFxCasaSchema.nullable().optional(),
};

const bankSchema = z
  .object({
    type: z.literal(AccountType.BANK),
    ...baseFields,
    bankName: z.string().min(1),
    accountKind: z.enum([AccountKind.SAVINGS, AccountKind.CHECKING]),
  })
  .strict();

const creditSchema = z
  .object({
    type: z.literal(AccountType.CREDIT),
    ...baseFields,
    issuer: z.string().min(1),
    creditLimitMinor: z.number().int().min(0).optional(),
    statementDay: z.number().int().min(1).max(31),
    paymentDueDay: z.number().int().min(1).max(31),
  })
  .strict();

const investmentSchema = z
  .object({
    type: z.literal(AccountType.INVESTMENT),
    ...baseFields,
    broker: z.string().min(1),
    investmentType: z.enum([
      InvestmentType.STOCKS,
      InvestmentType.BONDS,
      InvestmentType.MUTUAL_FUNDS,
      InvestmentType.CERTS_OF_DEPOSIT,
      InvestmentType.OTHER,
    ]),
  })
  .strict();

const cryptoSchema = z
  .object({
    type: z.literal(AccountType.CRYPTO),
    ...baseFields,
    walletAddress: z.string().optional(),
  })
  .strict();

const cashSchema = z
  .object({
    type: z.literal(AccountType.CASH),
    ...baseFields,
  })
  .strict();

const otherSchema = z
  .object({
    type: z.literal(AccountType.OTHER),
    ...baseFields,
  })
  .strict();

export const accountCreateSchema = z.discriminatedUnion('type', [
  bankSchema,
  creditSchema,
  investmentSchema,
  cryptoSchema,
  cashSchema,
  otherSchema,
]);

export type AccountCreateInput = z.infer<typeof accountCreateSchema>;
