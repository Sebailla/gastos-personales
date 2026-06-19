/**
 * accountUpdateSchema — Zod partial of the create schema.
 *
 * The update endpoint accepts a subset of the create
 * fields. `type` is required (to know which per-type field
 * set to validate) but every other field is optional. PATCH
 * is idempotent and partial; an empty body is accepted as a
 * no-op.
 *
 * The shape is a `z.discriminatedUnion` over the 6 per-type
 * partial schemas. The partials are written by hand
 * (instead of derived via `.partial()`) so the `type`
 * discriminator stays required and the per-type refinement
 * is preserved.
 */

import { z } from 'zod';
import {
  AccountCurrency,
  AccountKind,
  InvestmentType,
  OpeningBalanceMode,
  AccountType,
} from '../../domain/entities/financial-account';

const accountCurrencySchema = z.enum([
  AccountCurrency.ARS,
  AccountCurrency.USD,
  AccountCurrency.EUR,
]);

const openingBalanceUpdateSchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal(OpeningBalanceMode.FRESH),
        amountMinor: z.number().int().min(0).optional(),
        date: z.null().optional(),
      })
      .strict(),
    z
      .object({
        mode: z.literal(OpeningBalanceMode.HISTORICAL),
        amountMinor: z.number().int().min(0).optional(),
        date: z.coerce.date().optional(),
      })
      .strict(),
  ])
  .optional();

const bankUpdateSchema = z
  .object({
    type: z.literal(AccountType.BANK),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
    bankName: z.string().min(1).optional(),
    accountKind: z.enum([AccountKind.SAVINGS, AccountKind.CHECKING]).optional(),
  })
  .strict();

const creditUpdateSchema = z
  .object({
    type: z.literal(AccountType.CREDIT),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
    issuer: z.string().min(1).optional(),
    creditLimitMinor: z.number().int().min(0).optional(),
    statementDay: z.number().int().min(1).max(31).optional(),
    paymentDueDay: z.number().int().min(1).max(31).optional(),
  })
  .strict();

const investmentUpdateSchema = z
  .object({
    type: z.literal(AccountType.INVESTMENT),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
    broker: z.string().min(1).optional(),
    investmentType: z
      .enum([
        InvestmentType.STOCKS,
        InvestmentType.BONDS,
        InvestmentType.MUTUAL_FUNDS,
        InvestmentType.CERTS_OF_DEPOSIT,
        InvestmentType.OTHER,
      ])
      .optional(),
  })
  .strict();

const cryptoUpdateSchema = z
  .object({
    type: z.literal(AccountType.CRYPTO),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
    walletAddress: z.string().optional(),
  })
  .strict();

const cashUpdateSchema = z
  .object({
    type: z.literal(AccountType.CASH),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
  })
  .strict();

const otherUpdateSchema = z
  .object({
    type: z.literal(AccountType.OTHER),
    name: z.string().min(1).max(80).optional(),
    currency: accountCurrencySchema.optional(),
    openingBalance: openingBalanceUpdateSchema,
  })
  .strict();

export const accountUpdateSchema = z.discriminatedUnion('type', [
  bankUpdateSchema,
  creditUpdateSchema,
  investmentUpdateSchema,
  cryptoUpdateSchema,
  cashUpdateSchema,
  otherUpdateSchema,
]);

export type AccountUpdateInput = z.infer<typeof accountUpdateSchema>;
