/**
 * accountBalanceSchema — Zod schema for the
 * `GET /api/accounts/:id/balance` query string.
 *
 * The only required field is `displayCurrency`; the value
 * must be one of the 3 whitelisted `AccountCurrency`
 * values. The native currency is read from the row, not
 * from the query.
 */

import { z } from 'zod';
import { AccountCurrency } from '../../domain/entities/financial-account';

export const accountBalanceSchema = z
  .object({
    displayCurrency: z.enum([
      AccountCurrency.ARS,
      AccountCurrency.USD,
      AccountCurrency.EUR,
    ]),
  })
  .strict();

export type AccountBalanceQuery = z.infer<typeof accountBalanceSchema>;
